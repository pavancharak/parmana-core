/**
 * Maker checker for the live checks: propose a change as the maker,
 * review and approve it as the checker. One command per call, so the
 * maker and the checker can be different people on different machines.
 *
 *   $env:PARMANA_URL = "https://parmana-api-real.vercel.app"
 *   $env:PARMANA_API_KEY = <the maker's or the checker's key, read hidden>
 *
 *   npx tsx examples/live-checks/governance.ts propose-policy --file examples/live-checks/authority-grant/policy.json
 *   npx tsx examples/live-checks/governance.ts propose-connector --capability livecheck:grant `
 *     --endpoint-url https://parmana-release-check.vercel.app/api/release --policy livecheck-grant --allowed-parameters amount,note
 *   npx tsx examples/live-checks/governance.ts propose-source --name livecheck-erp `
 *     --endpoint-url https://parmana-signal-check.vercel.app/api/signals --public-key-file signal-check.public.pem --key-id livecheck-erp-1
 *   npx tsx examples/live-checks/governance.ts propose-grant --caller-id livecheck-agent --capability livecheck:grant --max-amount 100 --valid-days 7
 *   npx tsx examples/live-checks/governance.ts propose-revoke --kind grant|connector|source ...
 *   npx tsx examples/live-checks/governance.ts approve --kind policy|connector|source|grant --id <changeId> `
 *     --step-up-key-file step-up.private.pem --step-up-key-id checker-pavan
 *
 * approve prints the change and asks the checker to type APPROVE before
 * it signs the step up authorization (valid 120 seconds) and sends it.
 * Nothing here prints or stores a key. It needs the SDK from this
 * repository: run `npm run build` first.
 */

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

import { ParmanaClient, signPolicyChangeStepUp } from "@parmana/sdk";

type Kind = "policy" | "connector" | "source" | "grant";

const KINDS: readonly Kind[] = ["policy", "connector", "source", "grant"];

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

function required(name: string): string {
  const value = option(name);

  if (value === undefined) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function kind(): Kind {
  const value = required("--kind") as Kind;

  if (!KINDS.includes(value)) {
    throw new Error(`--kind must be one of ${KINDS.join(", ")}.`);
  }

  return value;
}

function client(): ParmanaClient {
  const endpoint = process.env.PARMANA_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.PARMANA_API_KEY?.trim();

  if (!endpoint || !apiKey) {
    throw new Error("Set PARMANA_URL and PARMANA_API_KEY.");
  }

  return new ParmanaClient({ endpoint, apiKey, timeout: 60_000 });
}

function reason(fallback: string): string {
  return option("--reason") ?? fallback;
}

function show(label: string, change: object): void {
  console.log(JSON.stringify(change, null, 2));
  console.log(`\n${label}`);
}

async function proposePolicy(parmana: ParmanaClient): Promise<void> {
  const content = JSON.parse(readFileSync(required("--file"), "utf8")) as {
    policyId: string;
    policyVersion: string;
  };
  const change = await parmana.proposePolicyChange(
    content.policyId,
    content.policyVersion,
    {
      proposedContent: content,
      reason: reason(`Live check policy ${content.policyId}.`),
    },
  );
  show(`Proposed: ${change.pendingPolicyChangeId}, ${change.status}`, change);
}

async function proposeConnector(parmana: ParmanaClient): Promise<void> {
  const change = await parmana.proposeExternalConnectorChange({
    action: "register",
    capability: required("--capability"),
    endpointUrl: required("--endpoint-url"),
    policy: required("--policy"),
    allowedParameters: (option("--allowed-parameters") ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
    timeoutMs: 10_000,
    reason: reason("Live check: the endpoint acts on nothing."),
  });
  show(`Proposed: ${change.changeId}, ${change.status}`, change);
}

async function proposeSource(parmana: ParmanaClient): Promise<void> {
  const keyFile = option("--public-key-file");
  const change = await parmana.proposeBusinessSignalSourceChange({
    action: "register",
    name: required("--name"),
    endpointUrl: required("--endpoint-url"),
    timeoutMs: 10_000,
    ...(keyFile !== undefined && {
      publicKeyPem: readFileSync(keyFile, "utf8"),
    }),
    ...(option("--key-id") !== undefined && { keyId: required("--key-id") }),
    reason: reason("Live check source: answers from a fixed demo table."),
  });
  show(`Proposed: ${change.changeId}, ${change.status}`, change);
}

async function proposeGrant(parmana: ParmanaClient): Promise<void> {
  const days = Number(option("--valid-days") ?? 7);
  const maxAmount = Number(required("--max-amount"));

  if (!Number.isFinite(days) || days <= 0 || days > 366) {
    throw new Error("--valid-days must be from 1 to 366.");
  }

  if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
    throw new Error("--max-amount must be a positive number.");
  }

  const change = await parmana.proposeAuthorityGrantChange({
    action: "grant",
    callerId: required("--caller-id"),
    capability: required("--capability"),
    limits: { "parameters.amount": { max: maxAmount } },
    validUntil: new Date(Date.now() + days * 86_400_000).toISOString(),
    reason: reason(`Live check grant, up to ${maxAmount} per request.`),
  });
  show(`Proposed: ${change.changeId}, ${change.status}`, change);
}

async function proposeRevoke(parmana: ParmanaClient): Promise<void> {
  const why = reason("Live check done.");

  switch (kind()) {
    case "grant": {
      const change = await parmana.proposeAuthorityGrantChange({
        action: "revoke",
        callerId: required("--caller-id"),
        capability: required("--capability"),
        reason: why,
      });
      show(`Proposed revoke: ${change.changeId}, ${change.status}`, change);
      return;
    }
    case "connector": {
      const change = await parmana.proposeExternalConnectorChange({
        action: "revoke",
        capability: required("--capability"),
        reason: why,
      });
      show(`Proposed revoke: ${change.changeId}, ${change.status}`, change);
      return;
    }
    case "source": {
      const change = await parmana.proposeBusinessSignalSourceChange({
        action: "revoke",
        name: required("--name"),
        reason: why,
      });
      show(`Proposed revoke: ${change.changeId}, ${change.status}`, change);
      return;
    }
    case "policy":
      throw new Error("A policy version is not revoked; revoke what uses it.");
  }
}

/** The pending change to review, or undefined when it is not pending. */
async function pending(
  parmana: ParmanaClient,
  which: Kind,
  id: string,
): Promise<object | undefined> {
  switch (which) {
    case "policy":
      return (await parmana.policyChanges("PENDING_APPROVAL")).find(
        (change) => change.pendingPolicyChangeId === id,
      );
    case "connector":
      return (await parmana.externalConnectorChanges("PENDING_APPROVAL")).find(
        (change) => change.changeId === id,
      );
    case "source":
      return (
        await parmana.businessSignalSourceChanges("PENDING_APPROVAL")
      ).find((change) => change.changeId === id);
    case "grant":
      return (await parmana.authorityGrantChanges("PENDING_APPROVAL")).find(
        (change) => change.changeId === id,
      );
  }
}

async function approve(parmana: ParmanaClient): Promise<void> {
  const which = kind();
  const id = required("--id");
  const privateKeyPem = readFileSync(required("--step-up-key-file"), "utf8");
  const keyId = required("--step-up-key-id");

  const change = await pending(parmana, which, id);

  if (change === undefined) {
    throw new Error(
      `${which} change ${id} is not waiting for approval: it may be approved or rejected already.`,
    );
  }

  console.log("The change to review:\n");
  console.log(JSON.stringify(change, null, 2));

  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await terminal.question(
    "\nType APPROVE to approve exactly this change (anything else stops): ",
  );
  terminal.close();

  if (answer.trim() !== "APPROVE") {
    console.log("Stopped. Nothing was approved.");
    return;
  }

  // Signed after the confirmation: the authorization is valid 120 seconds.
  const stepUp = signPolicyChangeStepUp({
    pendingPolicyChangeId: id,
    action: "approve",
    privateKeyPem,
    keyId,
  });

  const approved = await {
    policy: () => parmana.approvePolicyChange(id, stepUp),
    connector: () => parmana.approveExternalConnectorChange(id, stepUp),
    source: () => parmana.approveBusinessSignalSourceChange(id, stepUp),
    grant: () => parmana.approveAuthorityGrantChange(id, stepUp),
  }[which]();

  console.log(`Status: ${approved.status}`);
}

const COMMANDS: Record<string, (parmana: ParmanaClient) => Promise<void>> = {
  "propose-policy": proposePolicy,
  "propose-connector": proposeConnector,
  "propose-source": proposeSource,
  "propose-grant": proposeGrant,
  "propose-revoke": proposeRevoke,
  approve,
};

async function main(): Promise<void> {
  const command = process.argv[2] ?? "";
  const run = COMMANDS[command];

  if (run === undefined) {
    throw new Error(
      `The first argument must be one of: ${Object.keys(COMMANDS).join(", ")}.`,
    );
  }

  await run(client());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
