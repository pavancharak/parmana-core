/**
 * Approval cases. Shows how Parmana treats a human approval, using the public SDK against the
 * local server from ../start-server.sh (after setup.mjs and governed-flow.ts).
 *
 *   A. No approval attached.                                  -> refused (policy condition)
 *   B. Approval whose ttlSeconds has passed.                  -> refused (humanApproved verified false)
 *   C. Approval for another target.                           -> refused (humanApproved verified false)
 *   D. A transaction DECLARED without its approval, executed  -> refused. An approval cannot be added later.
 *   E. The same request DECLARED with its approval            -> approved.
 *
 * Set GOVERNED_POLICY_VERSION to the policy version in effect (default 2.1.0).
 *
 *   npx tsx docs/developer-portal/examples/governed-quickstart/typescript/approval-cases.ts
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  ParmanaClient,
  ParmanaError,
  createBusinessTransaction,
  signApproval,
} from "@parmana/sdk";

const configDir =
  process.env.GOVERNED_CONFIG_DIR ??
  join(homedir(), ".parmana", "governed-quickstart");
const endpoint = process.env.PARMANA_ENDPOINT ?? "http://localhost:3000";
const POLICY_VERSION = process.env.GOVERNED_POLICY_VERSION ?? "2.1.0";
const rawKeys = JSON.parse(
  readFileSync(join(configDir, "raw-keys.json"), "utf8"),
) as { demo: string };
const approverPrivatePem = readFileSync(
  join(configDir, "local-test-approver__local-test-approver-key-1.private.pem"),
  "utf8",
);
const client = new ParmanaClient({ endpoint, apiKey: rawKeys.demo });

function approval(
  overrides: { ttlSeconds?: number; resourceId?: string } = {},
) {
  return signApproval({
    privateKeyPem: approverPrivatePem,
    approverId: "local-test-approver",
    keyId: "local-test-approver-key-1",
    capability: "test:fixture-execute",
    resourceId: overrides.resourceId ?? "vendor://payments",
    maxAmount: 1000,
    ...(overrides.ttlSeconds !== undefined
      ? { ttlSeconds: overrides.ttlSeconds }
      : {}),
  });
}

function request(id: string, approvalArtifact: unknown | undefined) {
  return createBusinessTransaction({
    businessTransactionId: id,
    principalId: "demo",
    purpose: "Approval case",
    action: "test:fixture-execute",
    target: "vendor://payments",
    parameters: { amount: 1000, currency: "USD" },
    policy: {
      name: "vendor-payment",
      version: POLICY_VERSION,
      schemaVersion: "1.0.0",
    },
    signals: {
      humanApproved: approvalArtifact !== undefined,
      ...(approvalArtifact !== undefined ? { approvalArtifact } : {}),
      vendorVerified: true,
      invoiceVerified: true,
      paymentApproved: true,
      sufficientFunds: true,
      paymentAmount: 1000,
      riskScore: 5,
      vendorId: "vendor://payments",
    },
  });
}

async function attempt(
  label: string,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
    console.log(`${label}: APPROVED`);
  } catch (error) {
    if (error instanceof ParmanaError) {
      console.log(
        `${label}: refused (${error.constructor.name}, HTTP ${(error as { statusCode?: number }).statusCode}): ${error.message}`,
      );
    } else {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  await attempt("A. no approval attached", () =>
    client.execute(request(randomUUID(), undefined)),
  );

  const short = approval({ ttlSeconds: 1 });
  await new Promise((resolve) => setTimeout(resolve, 2500));
  await attempt("B. approval expired (ttl 1s)", () =>
    client.execute(request(randomUUID(), short)),
  );

  await attempt("C. approval for another target", () =>
    client.execute(
      request(randomUUID(), approval({ resourceId: "vendor://other" })),
    ),
  );

  const idD = randomUUID();
  await client.declareTransaction(request(idD, undefined));
  await attempt("D. declared without approval, then executed", () =>
    client.executeTransaction(idD),
  );

  const idE = randomUUID();
  await client.declareTransaction(request(idE, approval()));
  await attempt("E. declared with approval, then executed", () =>
    client.executeTransaction(idE),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
