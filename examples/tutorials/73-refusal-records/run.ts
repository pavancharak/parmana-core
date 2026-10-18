import crypto from "node:crypto";

import type { BusinessTransaction } from "@parmana/shared";
import {
  demoApprovalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

//
// RFC-0021: every policy REJECT produces a durable, signed Refusal
// Record -- not just an HTTP 403 that vanishes once the response is
// sent. It's independently verifiable with nothing but the artifact
// and Parmana's public key, exactly like a Receipt (Tutorial 55) or a
// Settlement Confirmation (Tutorial 68).
//
process.env.NODE_ENV = "test";

const { createExecutionSystem } =
  await import("../../../packages/api/src/bootstrap/createExecutionSystem.js");
const { createApplication } =
  await import("../../../packages/api/src/application.js");

function vendorPaymentTransaction(overrides: {
  riskScore: number;
}): BusinessTransaction {
  const businessTransactionId = crypto.randomUUID();
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const now = new Date();

  return {
    businessTransactionId,
    metadata: {
      businessTransactionId,
      correlationId: crypto.randomUUID(),
      createdBy: "tutorial-73",
      createdAt: now,
    },
    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId: "tutorial-73",
      displayName: "Tutorial 73",
      issuedAt: now,
    },
    authorization: {
      authorizationId,
      authorityId,
      purpose: "Tutorial",
      authorizedAt: now,
    },
    intent: {
      intentId,
      authorizationId,
      action: "payments:execute",
      target: "vendor://payments",
      parameters: Object.freeze({ paymentId: "payment-001", amount: 1000 }),
      createdAt: now,
    },
    policy: {
      name: "vendor-payment",
      version: "2.1.0",
      schemaVersion: "1.0.0",
    },
    signals: {
      vendorVerified: true,
      invoiceVerified: true,
      paymentApproved: true,
      sufficientFunds: true,
      paymentAmount: 1000,
      riskScore: overrides.riskScore,
      vendorId: "vendor://payments",
    },
    status: "RECEIVED",
    createdAt: now,
  } as unknown as BusinessTransaction;
}

console.log();
console.log("==================================================");
console.log("Tutorial 73 - Refusal Records");
console.log("==================================================");
console.log();

const executionSystem = await createExecutionSystem();
const application = createApplication(executionSystem, demoApprovalVerifier());

// riskScore: 999 fails vendor-payment/2.1.0's own risk-score rule
// (requires <= 20) -- an ordinary PolicyEngine REJECT.
const transaction = vendorPaymentTransaction({ riskScore: 999 });

console.log("Submitting a transaction policy will reject (riskScore: 999)");
console.log("--------------------------------------------------");

try {
  await application.execute(await withDemoApproval(transaction));
  console.log("✗ Expected this transaction to be rejected by policy.");
} catch (error) {
  console.log(
    `Rejected as expected : ${error instanceof Error ? error.message : String(error)}`,
  );
}
console.log();

console.log("Retrieving the durable Refusal Record produced by that rejection");
console.log("--------------------------------------------------");

const refusalRecord = await application.getRefusalRecord(
  transaction.businessTransactionId,
);

console.log(`Refusal Record found     : ${refusalRecord !== null}`);
console.log(`decision.outcome         : ${refusalRecord?.decision.outcome}`);
console.log(`decision.reason          : ${refusalRecord?.decision.reason}`);
console.log(`Signed (algorithm)       : ${refusalRecord?.signature.algorithm}`);
console.log();

console.log("Independently verifying the Refusal Record's signature");
console.log("--------------------------------------------------");

const genuineValid =
  refusalRecord !== null &&
  (await application.verifyRefusalRecord(refusalRecord));
console.log(`Genuine record verifies as valid : ${genuineValid}`);

// Tamper with the reason after the fact -- exactly what an attacker
// trying to rewrite the historical record of why something was
// refused would attempt.
const tamperedRecord = refusalRecord && {
  ...refusalRecord,
  decision: {
    ...refusalRecord.decision,
    reason: "forged: this was actually approved",
  },
};
const tamperedValid =
  tamperedRecord !== null &&
  (await application.verifyRefusalRecord(tamperedRecord!));
console.log(`Tampered record verifies as valid : ${tamperedValid}`);
console.log();

if (
  refusalRecord !== null &&
  genuineValid === true &&
  tamperedValid === false
) {
  console.log(
    "✓ A durable, signed Refusal Record was produced, verifies genuinely, and rejects tampering.",
  );
} else {
  console.log(
    "✗ Expected a genuine Refusal Record that verifies true, and a tampered one that verifies false.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 74 - Refusal Record Fail-Open");
