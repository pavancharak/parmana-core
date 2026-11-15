import crypto from "node:crypto";
import path from "node:path";

import type { BusinessTransaction } from "@parmana/shared";
import {
  demoApprovalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

//
// Without this check, every transaction-scoped route (trust-records,
// verify, verification, replay, receipt) keys purely off
// businessTransactionId with no ownership check at all -- any
// authenticated caller could read any other caller's complete
// transaction, trust record, and receipt history (IDOR / broken
// object-level authorization). isOwnedByCaller() closes that.
//
process.env.NODE_ENV = "test";

const { createExecutionSystem } =
  await import("../../../packages/api/src/bootstrap/createExecutionSystem.js");
const { createApplication } =
  await import("../../../packages/api/src/application.js");
const { isOwnedByCaller } =
  await import("../../../packages/api/src/auth/isOwnedByCaller.js");

function vendorPaymentTransaction(submittedBy: string): BusinessTransaction {
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
      // In the real HTTP layer, execute.ts overwrites this from
      // req.callerId server-side -- it is never trusted from client
      // input. This tutorial sets it directly since it calls
      // application.execute() itself, standing in for that server-set
      // step.
      createdBy: submittedBy,
      submittedBy,
      createdAt: now,
    },
    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId: submittedBy,
      displayName: submittedBy,
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
      // test:fixture-execute (not payments:execute/vendor-payment, removed
      // per docs/internal/VERIFICATION-GAPS.md G-27) -- see
      // packages/api/tests/fixtures/business-transaction.ts for the same
      // pattern.
      action: "test:fixture-execute",
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
      riskScore: 10,
      vendorId: "vendor://payments",
    },
    status: "RECEIVED",
    createdAt: now,
  } as unknown as BusinessTransaction;
}

console.log();
console.log("==================================================");
console.log("Tutorial 77 - Caller Ownership Scoping");
console.log("==================================================");
console.log();

const executionSystem = await createExecutionSystem();
const application = createApplication(executionSystem, demoApprovalVerifier());

//
// Governance is always on (D19). vendor-payment 2.1.0 must have a signed
// policy-governance approval record before it can execute, so this tutorial
// approves it through the real PolicyChangeApprovalService, the same way
// tutorial 103 does, with a maker and a different checker.
//
async function approveVendorPaymentPolicy(): Promise<void> {
  const { PolicyChangeApprovalService } =
    await import("../../../packages/api/src/governance/PolicyChangeApprovalService.js");
  const { policyChangeApprovalRecordRepository } =
    await import("../../../packages/api/src/repositories.js");
  const { PolicyChangeCrypto } = await import("@parmana/crypto");
  const { FilePolicyRepository } = await import("@parmana/policy");
  const { PendingPolicyChangeStatus } = await import("@parmana/shared");

  const dir = path.resolve(
    process.cwd(),
    process.env.PARMANA_POLICY_DIR ?? "./policies",
  );
  const base = new FilePolicyRepository(dir);
  const readOnly = {
    load: (name: string, version: string) => base.load(name, version),
    save: async () => undefined,
  };
  const service = new PolicyChangeApprovalService({
    policyRepository: readOnly,
    policyChangeCrypto: new PolicyChangeCrypto(),
    policyChangeApprovalRecordRepository,
  });

  const policy = await base.load("vendor-payment", "2.1.0");

  await service.approve(
    {
      pendingPolicyChangeId: "tutorial-77-vendor-payment-2.1.0",
      policyName: "vendor-payment",
      policyVersion: "2.1.0",
      proposedContent:
        policy as unknown as import("@parmana/shared").PendingPolicyChange["proposedContent"],
      proposedBy: "tutorial-77-maker",
      proposedAt: new Date(),
      status: PendingPolicyChangeStatus.PENDING_APPROVAL,
      reason: "tutorial 77: policy-governance approval",
    },
    "tutorial-77-checker",
  );
}

await approveVendorPaymentPolicy();

const transaction = vendorPaymentTransaction("caller-a");
await application.execute(await withDemoApproval(transaction));

console.log(
  `Transaction ${transaction.businessTransactionId} submitted by caller-a and approved.`,
);
console.log();

console.log("Scenario 1: The owning caller looks up its own transaction");
console.log("--------------------------------------------------");
const ownerResult = await isOwnedByCaller(
  application,
  transaction.businessTransactionId,
  "caller-a",
);
console.log(`isOwnedByCaller(txn, "caller-a") -> ${ownerResult}`);
console.log();

console.log(
  "Scenario 2: A different, unrelated caller tries to look up the same transaction",
);
console.log("--------------------------------------------------");
const otherResult = await isOwnedByCaller(
  application,
  transaction.businessTransactionId,
  "caller-b",
);
console.log(`isOwnedByCaller(txn, "caller-b") -> ${otherResult}`);
console.log();

console.log(
  "Scenario 3: A caller looks up a transaction id that does not exist at all",
);
console.log("--------------------------------------------------");
const missingResult = await isOwnedByCaller(
  application,
  "does-not-exist",
  "caller-b",
);
console.log(
  `isOwnedByCaller("does-not-exist", "caller-b") -> ${missingResult}`,
);
console.log(
  "  (true here is deliberate -- a missing transaction is not an ownership question; the route's own",
);
console.log(
  '   404 handling runs unchanged, so a non-owner can\'t distinguish "not yours" from "doesn\'t exist".)',
);
console.log();

const allPassed =
  ownerResult === true && otherResult === false && missingResult === true;

if (allPassed) {
  console.log(
    "✓ The owner sees its own transaction; a different caller is denied; a missing id reads as a clean 404, not a 403.",
  );
} else {
  console.log("✗ Expected owner=true, other-caller=false, missing-id=true.");
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 78 - Duplicate Transaction Race");
