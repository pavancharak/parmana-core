/**
 * Declare, check status, then execute. The same action as governed-flow.ts, in
 * two steps, so an application can record a request before anything is released:
 *
 *   1. declareTransaction(): POST /transactions. Recorded as RECEIVED. Nothing is decided or released.
 *   2. transactionStatus(): GET /transactions/{id}/status. Shows the recorded lifecycle.
 *   3. executeTransaction(): POST /transactions/{id}/execute. Policy is evaluated and the action is
 *      released only when it is approved. The result is the signed Execution Trust Record.
 *
 * Policy version: the server executes only the version in effect, which is the one most recently
 * approved for the policy name. governed-flow.ts approves 2.1.0. If a later version (for example
 * 2.1.1, approved with the CLI) is approved, 2.1.0 is superseded and this example is refused with
 * "was superseded". Set GOVERNED_POLICY_VERSION to the version in effect (default 2.1.0).
 *
 * Run from the repository root, after setup.mjs, with the server running:
 *
 *   npx tsx docs/developer-portal/examples/governed-quickstart/typescript/declare-then-execute.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  ParmanaClient,
  ParmanaError,
  createBusinessTransaction,
  signApproval,
  type BusinessTransaction,
} from "@parmana/sdk";

const configDir =
  process.env.GOVERNED_CONFIG_DIR ??
  join(homedir(), ".parmana", "governed-quickstart");
const endpoint = process.env.PARMANA_ENDPOINT ?? "http://localhost:3000";
const rawKeys = JSON.parse(
  readFileSync(join(configDir, "raw-keys.json"), "utf8"),
) as { demo: string };
const approverPrivatePem = readFileSync(
  join(configDir, "local-test-approver__local-test-approver-key-1.private.pem"),
  "utf8",
);
const POLICY_VERSION = process.env.GOVERNED_POLICY_VERSION ?? "2.1.0";
const client = new ParmanaClient({ endpoint, apiKey: rawKeys.demo });

async function main(): Promise<void> {
  const businessTransactionId = randomUUID();
  const approval = signApproval({
    privateKeyPem: approverPrivatePem,
    approverId: "local-test-approver",
    keyId: "local-test-approver-key-1",
    capability: "test:fixture-execute",
    resourceId: "vendor://payments",
    maxAmount: 250,
  });
  const transaction: BusinessTransaction = createBusinessTransaction({
    businessTransactionId,
    principalId: "demo",
    purpose: "Declare then execute",
    action: "test:fixture-execute",
    target: "vendor://payments",
    parameters: { amount: 250, currency: "USD" },
    policy: {
      name: "vendor-payment",
      version: POLICY_VERSION,
      schemaVersion: "1.0.0",
    },
    signals: {
      humanApproved: true,
      approvalArtifact: approval,
      vendorVerified: true,
      invoiceVerified: true,
      paymentApproved: true,
      sufficientFunds: true,
      paymentAmount: 250,
      riskScore: 5,
      vendorId: "vendor://payments",
    },
  });

  console.log(`1. declare ${businessTransactionId}`);
  const declared = await client.declareTransaction(transaction);
  console.log(`   status: ${declared.status}`);

  console.log("2. status");
  const status = await client.transactionStatus(businessTransactionId);
  console.log(
    `   current: ${status.current.status} (stage ${status.current.stage})`,
  );

  console.log("3. execute");
  const record = await client.executeTransaction(businessTransactionId);
  console.log(`   trust record: ${record.trustRecordId}`);
  console.log(`   outcome: ${record.executions[0]?.decision.outcome}`);

  const after = await client.transactionStatus(businessTransactionId, {
    history: true,
  });
  console.log(
    `4. status after execution: ${after.current.status} (${after.history?.length ?? 0} events in history)`,
  );
}

main().catch((error: unknown) => {
  if (error instanceof ParmanaError) {
    console.error(`${error.constructor.name}: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
