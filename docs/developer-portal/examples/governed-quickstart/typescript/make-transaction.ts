/**
 * Writes a Business Transaction as JSON, for the REST examples (rest-smoke.sh) and for
 * curl, so the same request can be sent without the SDK.
 *
 *   npx tsx docs/developer-portal/examples/governed-quickstart/typescript/make-transaction.ts <out.json> [policyVersion] [--no-approval]
 *
 * With --no-approval, humanApproved is false and no approval is attached, so the server refuses it
 * (use this to create a refusal record). The approval, when attached, is signed with the test approver
 * key from setup.mjs. Prints the businessTransactionId on stdout.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { createBusinessTransaction, signApproval } from "@parmana/sdk";

const args = process.argv.slice(2);
const noApproval = args.includes("--no-approval");
const positional = args.filter((a) => !a.startsWith("--"));
const [
  outPath,
  policyVersion = process.env.GOVERNED_POLICY_VERSION ?? "2.1.0",
] = positional;
if (!outPath) {
  console.error(
    "usage: make-transaction.ts <out.json> [policyVersion] [--no-approval]",
  );
  process.exit(2);
}

const configDir =
  process.env.GOVERNED_CONFIG_DIR ??
  join(homedir(), ".parmana", "governed-quickstart");
const approverPrivatePem = readFileSync(
  join(configDir, "local-test-approver__local-test-approver-key-1.private.pem"),
  "utf8",
);

const businessTransactionId = randomUUID();
const approval = noApproval
  ? undefined
  : signApproval({
      privateKeyPem: approverPrivatePem,
      approverId: "local-test-approver",
      keyId: "local-test-approver-key-1",
      capability: "test:fixture-execute",
      resourceId: "vendor://payments",
      maxAmount: 1000,
    });

const transaction = createBusinessTransaction({
  businessTransactionId,
  principalId: "demo",
  purpose: "REST example",
  action: "test:fixture-execute",
  target: "vendor://payments",
  parameters: { amount: 1000, currency: "USD" },
  policy: {
    name: "vendor-payment",
    version: policyVersion,
    schemaVersion: "1.0.0",
  },
  signals: {
    humanApproved: !noApproval,
    ...(approval ? { approvalArtifact: approval } : {}),
    vendorVerified: true,
    invoiceVerified: true,
    paymentApproved: true,
    sufficientFunds: true,
    paymentAmount: 1000,
    riskScore: 5,
    vendorId: "vendor://payments",
  },
});

writeFileSync(outPath, JSON.stringify(transaction, null, 2));
console.log(businessTransactionId);
