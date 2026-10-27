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
 *   npx tsx examples/live-checks/governance.ts propose-issuer --approver-id manager-pavan --key-id manager-pavan-key-2 `
 *     --public-key-file manager-pavan__manager-pavan-key-2.public.pem --reason "Approver for the live refund check."
 *   npx tsx examples/live-checks/governance.ts approve-issuer --id <changeId> `
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

interface IssuerChange {
  readonly changeId: string;
  readonly status: string;
  readonly action: string;
  readonly approverId: string;
  readonly keyId: string;
}

const ISSUER_CHANGES = "/approval-issuers/changes";

/**
 * Approval issuers are not in the SDK, so these calls use the routes
 * directly, with the same API key the other commands use.
 */
async function issuerRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: object,
): Promise<T> {
  const endpoint = process.env.PARMANA_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.PARMANA_API_KEY?.trim();

  if (!endpoint || !apiKey) {
    throw new Error("Set PARMANA_URL and PARMANA_API_KEY.");
  }

  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed: unknown = text === "" ? {} : JSON.parse(text);

  if (!response.ok) {
    throw new Error(
      `${method} ${path} failed with ${response.status}: ${JSON.stringify(parsed)}`,
    );
  }

  return parsed as T;
}

/** The maker proposes an approver with its public key. */
async function proposeIssuer(): Promise<void> {
  const change = await issuerRequest<IssuerChange>("POST", ISSUER_CHANGES, {
    action: "add",
    approverId: required("--approver-id"),
    keyId: required("--key-id"),
    publicKeyPem: readFileSync(required("--public-key-file"), "utf8"),
    reason: reason("Approver added for the live refund check."),
  });
  show(`Proposed: ${change.changeId}, ${change.status}`, change);
}

/** The checker approves it, with a step up authorization for this change. */
async function approveIssuer(): Promise<void> {
  const id = required("--id");
  const privateKeyPem = readFileSync(required("--step-up-key-file"), "utf8");
  const keyId = required("--step-up-key-id");

  const { changes } = await issuerRequest<{ changes: IssuerChange[] }>(
    "GET",
    `${ISSUER_CHANGES}?status=PENDING_APPROVAL`,
  );
  const change = changes.find((item) => item.changeId === id);

  if (change === undefined) {
    throw new Error(
      `approver change ${id} is not waiting for approval: it may be approved or rejected already.`,
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

  const stepUp = signPolicyChangeStepUp({
    pendingPolicyChangeId: id,
    action: "approve",
    privateKeyPem,
    keyId,
  });

  const approved = await issuerRequest<IssuerChange>(
    "POST",
    `${ISSUER_CHANGES}/${id}/approve`,
    { stepUpAuthorization: stepUp },
  );
  console.log(`Status: ${approved.status}`);
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
  "propose-issuer": proposeIssuer,
  "approve-issuer": approveIssuer,
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
