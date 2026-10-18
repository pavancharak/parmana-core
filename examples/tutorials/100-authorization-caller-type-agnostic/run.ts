import crypto from "node:crypto";

import { FilePolicyRepository } from "@parmana/policy";
import { RuntimeBuilder } from "@parmana/runtime";
import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";
import type { BusinessTransaction } from "@parmana/shared";
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

//
// Strategic-positioning claim (docs/CLAIMS.md 2.24): the authorization
// pipeline's outcome depends only on the requested action, the governing
// policy, and independently-verified facts -- never on what kind of
// system, model, or entity submitted the request. Mirrors
// packages/api/tests/integration/authority-type-agnostic-execution.integration.test.ts
// at the library level: BusinessTransactionMapper.fromRequest casts the
// caller-declared `authority` field with no runtime validation against
// the AuthorityType enum, so an arbitrary string reaches RuntimeEngine
// unfiltered. RuntimeEngine/PolicyEngine/SignalIntentBinder/
// CapabilityPolicyBinder contain zero references to `authority` or
// caller identity anywhere in their source -- the strongest test of
// that is sending a nonsense authorityType and confirming the outcome
// is byte-for-byte identical to a conventional "USER" transaction.
//

async function buildTransaction(
  authorityType: string,
  overrideSignals?: Record<string, unknown>,
): Promise<BusinessTransaction> {
  const businessTransactionId = crypto.randomUUID();
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const fixedDate = new Date("2026-01-01T00:00:00Z");

  return withDemoApproval({
    businessTransactionId,
    metadata: { businessTransactionId },
    authority: {
      authorityId,
      authorityType: authorityType as never,
      principalId: "tutorial-100",
      issuedAt: fixedDate,
    },
    authorization: {
      authorizationId,
      authorityId,
      purpose: "tutorial",
      issuedAt: fixedDate,
    },
    intent: {
      intentId: crypto.randomUUID(),
      authorizationId,
      action: "release-payment",
      target: "vendor",
      parameters: { vendorId: "VENDOR-1001", amount: 25000 },
      createdAt: fixedDate,
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
      paymentAmount: 25000,
      riskScore: 12,
      vendorId: "vendor",
      ...overrideSignals,
    },
    status: "RECEIVED" as never,
    createdAt: fixedDate,
  });
}

function buildRuntime() {
  return new RuntimeBuilder()
    .withSignalStateVerifier(demoApprovalSignalVerifier())
    .withPolicyRepository(new FilePolicyRepository("policies"))
    .build(new MemoryExecutionTrustRecordRepository());
}

console.log();
console.log("==================================================");
console.log("Tutorial 100 - Authorization Is Caller-Type-Agnostic");
console.log("==================================================");
console.log();

console.log(
  "Scenario 1: An APPROVE-shaped transaction, authorityType 'USER' vs. a nonsense value",
);
console.log("--------------------------------------------------");

const userApprove = await buildRuntime().execute(
  await buildTransaction("USER"),
);
const novelApprove = await buildRuntime().execute(
  await buildTransaction("FULLY_AUTONOMOUS_AI_AGENT_NEVER_SEEN_BEFORE"),
);

const userApproveDecision = userApprove.trustRecord.executions[0]!.decision;
const novelApproveDecision = novelApprove.trustRecord.executions[0]!.decision;

console.log(
  `USER            -> outcome: ${userApproveDecision.outcome}, reason: ${userApproveDecision.reason}`,
);
console.log(
  `Nonsense caller -> outcome: ${novelApproveDecision.outcome}, reason: ${novelApproveDecision.reason}`,
);
console.log();

console.log(
  "Scenario 2: A REJECT-shaped transaction (insufficient funds), same authorityType comparison",
);
console.log("--------------------------------------------------");

const rejectingSignals = { sufficientFunds: false };

let userRejectReason: string | undefined;
let userRejectStatus: number | undefined;
let userRejectCode: string | undefined;
try {
  await buildRuntime().execute(
    await buildTransaction("USER", rejectingSignals),
  );
} catch (error) {
  userRejectReason = (error as { message?: string }).message;
  userRejectStatus = (error as { status?: number }).status;
  userRejectCode = (error as { code?: string }).code;
}

let novelRejectReason: string | undefined;
let novelRejectStatus: number | undefined;
let novelRejectCode: string | undefined;
try {
  await buildRuntime().execute(
    await buildTransaction(
      "FULLY_AUTONOMOUS_AI_AGENT_NEVER_SEEN_BEFORE",
      rejectingSignals,
    ),
  );
} catch (error) {
  novelRejectReason = (error as { message?: string }).message;
  novelRejectStatus = (error as { status?: number }).status;
  novelRejectCode = (error as { code?: string }).code;
}

console.log(
  `USER            -> rejected (${userRejectStatus}/${userRejectCode}): ${userRejectReason}`,
);
console.log(
  `Nonsense caller -> rejected (${novelRejectStatus}/${novelRejectCode}): ${novelRejectReason}`,
);
console.log();

const allPassed =
  userApproveDecision.outcome === "APPROVED" &&
  novelApproveDecision.outcome === userApproveDecision.outcome &&
  novelApproveDecision.reason === userApproveDecision.reason &&
  userRejectReason !== undefined &&
  novelRejectReason === userRejectReason &&
  novelRejectStatus === userRejectStatus &&
  novelRejectCode === userRejectCode;

if (allPassed) {
  console.log(
    "✓ Identical outcome and reason regardless of authorityType -- including a value outside the AuthorityType enum entirely.",
  );
} else {
  console.log(
    "✗ Expected byte-identical decisions across both authorityType values, on both the APPROVE and REJECT paths.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log(
  "Next: Tutorial 101 - Fail-Closed Caller-Authentication Audit Writes",
);
