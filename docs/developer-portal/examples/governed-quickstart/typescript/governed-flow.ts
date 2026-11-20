/**
 * Governed quickstart (TypeScript). Runs the whole governed path with the public
 * @parmana/sdk package against a local server started by ../start-server.sh:
 *
 *   1. The maker proposes vendor-payment@2.1.0 (maker-checker: propose).
 *   2. The maker tries to approve its own proposal. The server refuses it.
 *   3. The checker approves with a step-up signature. The policy version takes effect.
 *   4. The demo caller executes a Business Transaction with a signed human approval.
 *   5. The server verifies the Execution Trust Record, and the SDK verifies it offline.
 *   6. Submitting the same businessTransactionId again is refused.
 *
 * Run from the repository root, after `node docs/developer-portal/examples/governed-quickstart/setup.mjs`
 * and with the server running:
 *
 *   npx tsx docs/developer-portal/examples/governed-quickstart/typescript/governed-flow.ts
 *
 * Test configuration only. The keys it reads are local secrets created by setup.mjs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  ExecutionRejectedError,
  ParmanaClient,
  ParmanaError,
  createBusinessTransaction,
  signApproval,
  signPolicyChangeStepUp,
  verifyExecutionTrustRecordOffline,
  type ExecutionTrustRecord,
} from "@parmana/sdk";

const configDir =
  process.env.GOVERNED_CONFIG_DIR ??
  join(homedir(), ".parmana", "governed-quickstart");
const endpoint = process.env.PARMANA_ENDPOINT ?? "http://localhost:3000";
const POLICY_NAME = "vendor-payment";
const POLICY_VERSION = "2.1.0";

const rawKeys = JSON.parse(
  readFileSync(join(configDir, "raw-keys.json"), "utf8"),
) as {
  maker: string;
  checker: string;
  demo: string;
};
const stepUpPrivatePem = readFileSync(
  join(configDir, "stepup-private.pem"),
  "utf8",
);
const approverPrivatePem = readFileSync(
  join(configDir, "local-test-approver__local-test-approver-key-1.private.pem"),
  "utf8",
);
const policyContent = JSON.parse(
  readFileSync(
    join(configDir, "policies", POLICY_NAME, POLICY_VERSION, "policy.json"),
    "utf8",
  ),
) as unknown;

const maker = new ParmanaClient({ endpoint, apiKey: rawKeys.maker });
const checker = new ParmanaClient({ endpoint, apiKey: rawKeys.checker });
const demo = new ParmanaClient({ endpoint, apiKey: rawKeys.demo });

function explain(error: unknown): string {
  if (error instanceof ParmanaError) {
    const status = (error as { statusCode?: number }).statusCode;
    return `${error.constructor.name}${status ? ` (HTTP ${status})` : ""}: ${error.message}`;
  }
  return String(error);
}

async function main(): Promise<void> {
  // 1. Maker proposes the policy version.
  console.log(`1. maker proposes ${POLICY_NAME}@${POLICY_VERSION}`);
  const proposal = await maker.proposePolicyChange(
    POLICY_NAME,
    POLICY_VERSION,
    {
      proposedContent: policyContent,
      reason: "Governed quickstart",
    },
  );
  const pendingId = proposal.pendingPolicyChangeId;
  console.log(`   pending change: ${pendingId}`);

  // 2. The maker may not approve its own change.
  console.log(
    "2. maker tries to approve its own change (expected to be refused)",
  );
  try {
    await maker.approvePolicyChange(
      pendingId,
      signPolicyChangeStepUp({
        pendingPolicyChangeId: pendingId,
        action: "approve",
        privateKeyPem: stepUpPrivatePem,
        keyId: "checker-step-up-key",
      }),
    );
    throw new Error(
      "The server accepted a self-approval. This must not happen.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("The server accepted")
    )
      throw error;
    console.log(`   refused as expected: ${explain(error)}`);
  }

  // 3. A distinct checker approves with a step-up signature.
  console.log("3. checker approves with a step-up signature");
  const resolved = await checker.approvePolicyChange(
    pendingId,
    signPolicyChangeStepUp({
      pendingPolicyChangeId: pendingId,
      action: "approve",
      privateKeyPem: stepUpPrivatePem,
      keyId: "checker-step-up-key",
    }),
  );
  console.log(`   status: ${resolved.status}`);

  // 4. The demo caller executes with a signed human approval for this action, target and amount.
  console.log("4. demo caller executes an approved action");
  const approval = signApproval({
    privateKeyPem: approverPrivatePem,
    approverId: "local-test-approver",
    keyId: "local-test-approver-key-1",
    capability: "test:fixture-execute",
    resourceId: "vendor://payments",
    maxAmount: 1000,
  });
  const transaction = createBusinessTransaction({
    principalId: "demo",
    purpose: "Governed quickstart",
    action: "test:fixture-execute",
    target: "vendor://payments",
    parameters: { amount: 1000, currency: "USD" },
    policy: {
      name: POLICY_NAME,
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
      paymentAmount: 1000,
      riskScore: 5,
      vendorId: "vendor://payments",
    },
  });

  let record: ExecutionTrustRecord;
  try {
    record = await demo.execute(transaction);
  } catch (error) {
    if (error instanceof ExecutionRejectedError) {
      console.error(`   rejected by policy: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  console.log(`   trust record: ${record.trustRecordId}`);
  console.log(`   outcome: ${record.executions[0]?.decision.outcome}`);

  // 5. Verify: by the server, then offline with the deployment's published public key.
  console.log("5. verification");
  const serverVerification = await demo.verify(record.businessTransactionId);
  console.log(`   server verification: ${serverVerification.status}`);
  const published = await demo.publicKey("default");
  const offline = verifyExecutionTrustRecordOffline(record, {
    default: published.pem,
  });
  console.log(
    `   offline (SDK): valid=${offline.valid} coverage=${offline.coverage} hashValid=${offline.hashValid} ` +
      `legacySignatureValid=${offline.legacySignatureValid}`,
  );
  if (!offline.valid)
    throw new Error(
      `Offline verification failed: ${offline.errors.join("; ")}`,
    );

  const recordPath = join(configDir, "governed-record.json");
  writeFileSync(recordPath, JSON.stringify(record, null, 2));
  console.log(`   record saved to ${recordPath}`);

  // 6. Replay: the same businessTransactionId is never executed twice.
  console.log(
    "6. the same transaction is submitted again (expected to be refused)",
  );
  try {
    await demo.execute(transaction);
    throw new Error(
      "The server accepted a repeated transaction. This must not happen.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("The server accepted")
    )
      throw error;
    console.log(`   refused as expected: ${explain(error)}`);
  }

  console.log("");
  console.log("Governed flow complete.");
}

main().catch((error: unknown) => {
  console.error(explain(error));
  process.exitCode = 1;
});
