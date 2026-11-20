import { generateKeyPairSync } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ApprovalSignalVerifier,
  ApprovalVerifier,
  StaticApprovalIssuerRegistry,
} from "@parmana/approval";
import {
  APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
  ApprovalArtifactSigner,
} from "@parmana/crypto";
import {
  PolicyEngine,
  PolicyOutcome,
  PolicyValidator,
  type Policy,
  type PolicySignals,
  type SignalStateVerificationRequest,
} from "@parmana/policy";
import {
  StaticBusinessSignalSourceRegistry,
  TrustedSignalResolver,
  type BusinessSignalSource,
} from "@parmana/runtime";
import { BusinessValidationStatus, type SignedApproval } from "@parmana/shared";
import { MemoryApprovalNonceLedger } from "@parmana/storage";
import { readFileSync } from "node:fs";
import { join } from "node:path";

//
// Human approval for one action: a person signs off on a single refund.
//
// The live policy policies/payment-refund/1.0.0/policy.json says:
//   * a refund is refused unless the payment source confirms the payment is
//     refundable (the source is asked by Parmana; the agent cannot declare it);
//   * with the source's confirmation, a refund needs managerApproved, which
//     counts only with a signed approval artifact from a trusted approver for
//     this payment (resourceId = the Intent target), at least this amount, not
//     expired and never used before.
//
// managerApproved is declared in the policy's approvalSignals. The agent sends
// no approval flag of its own: the signal is true only when the approval
// checks out. ApprovalSignalVerifier checks it before authorization, and again,
// without using it up, at the gateway just before release.
//
// The payment source is a STAND-IN (an in-process table), as in tutorial 129.
// Hermetic: a manager key made here and nonces kept in memory. In production the
// manager signs on their own machine with scripts/sign-approval.ts. See
// docs/site/guides/policy-lifecycle-and-approvals.mdx.
//

const repoRoot = dirname(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
);

const policy = JSON.parse(
  readFileSync(
    join(repoRoot, "policies", "payment-refund", "1.0.0", "policy.json"),
    "utf8",
  ),
) as Policy;
new PolicyValidator().validate(policy);

const ACTION = "payments:refund";

// Stand-in payment source. Production: the payment provider's signal service.
const PAYMENTS: Record<string, boolean> = {
  "payments/pay_ORD1001": true,
  "payments/pay_ORD1042": true,
  "payments/pay_ORD2000": true,
  "payments/pay_ORD3000": false,
};
const now = new Date();
const paymentSource: BusinessSignalSource = {
  name: "razorpay",
  resolve: async (query) => {
    if (!(query.subject in PAYMENTS)) {
      return { kind: "not_found", reason: "no such payment" };
    }
    return {
      kind: "observed",
      value: PAYMENTS[query.subject] ?? false,
      sourceIdentity: "razorpay:stand-in",
      observedAt: now,
      validUntil: new Date(now.getTime() + 60_000),
    };
  },
};
const resolver = new TrustedSignalResolver(
  new StaticBusinessSignalSourceRegistry([paymentSource]),
  { now: () => now },
);

// The manager's key pair. Only the public half is trusted by the server.
const manager = generateKeyPairSync("ed25519");
const MANAGER = { approverId: "manager-priya", keyId: "manager-priya-key-1" };

const approvalVerifier = new ApprovalVerifier({
  crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
  issuerRegistry: new StaticApprovalIssuerRegistry([
    {
      ...MANAGER,
      publicKey: manager.publicKey,
      revoked: false,
      capabilities: [ACTION],
    },
  ]),
  nonceStore: new MemoryApprovalNonceLedger(),
});
const approvalSignals = new ApprovalSignalVerifier(approvalVerifier);
const engine = new PolicyEngine();

let requestNumber = 0;

interface RefundRequest {
  readonly target: string;
  readonly amount: number;
  readonly approval?: SignedApproval;
}

function signalsFor(refund: RefundRequest): PolicySignals {
  return {
    refundAmount: refund.amount,
    managerApproved: refund.approval !== undefined,
    // Arrives over HTTP as JSON inside the request's signals.
    ...(refund.approval !== undefined && {
      approvalArtifact: JSON.parse(JSON.stringify(refund.approval)),
    }),
  };
}

function verificationRequest(
  refund: RefundRequest,
  stage: "authorize" | "release",
): SignalStateVerificationRequest {
  return {
    action: ACTION,
    businessTransactionId: `tutorial-119-${requestNumber}`,
    intentParameters: { amount: refund.amount },
    intentTarget: refund.target,
    stage,
    policy,
  };
}

/** The payment source, the policy, then the approval check, in the runtime's order. */
async function decide(
  refund: RefundRequest,
): Promise<{ approved: boolean; reason: string }> {
  requestNumber += 1;

  const resolved = await resolver.resolve({
    policy,
    action: ACTION,
    businessTransactionId: `tutorial-119-${requestNumber}`,
    intent: { target: refund.target, parameters: { amount: refund.amount } },
    proposedSignals: { refundAmount: refund.amount },
  });
  if (resolved.assessment.status !== BusinessValidationStatus.VALID) {
    return {
      approved: false,
      reason: `business validation ${resolved.assessment.status}: ${resolved.assessment.reason ?? "the payment source did not confirm"}`,
    };
  }

  const signals: PolicySignals = {
    ...signalsFor(refund),
    ...resolved.trustedValues,
  };
  const decision = engine.evaluate(policy, signals);

  if (decision.outcome !== PolicyOutcome.APPROVE) {
    return {
      approved: false,
      reason: `${decision.matchedRuleId}: ${decision.reason}`,
    };
  }

  const violations = await approvalSignals.findViolations(
    verificationRequest(refund, "authorize"),
    signals,
  );

  if (violations.length > 0) {
    const detail = violations
      .map(
        (v) =>
          `${v.signalKey}=${String(v.declaredValue)} != verified ${String(v.actualValue)}`,
      )
      .join(", ");
    return { approved: false, reason: `approval check: ${detail}` };
  }

  return { approved: true, reason: decision.matchedRuleId ?? "approved" };
}

async function managerSigns(
  target: string,
  maxAmount: number,
): Promise<SignedApproval> {
  return new ApprovalArtifactSigner().sign(
    {
      ...MANAGER,
      capability: ACTION,
      resourceId: target,
      scope: { field: "value", comparator: "lte", value: maxAmount },
      ttlSeconds: 900,
    },
    manager.privateKey,
  );
}

const results: Array<{ step: string; expected: boolean; actual: boolean }> = [];

async function step(
  label: string,
  refund: RefundRequest,
  expected: boolean,
): Promise<void> {
  const outcome = await decide(refund);
  results.push({ step: label, expected, actual: outcome.approved });
  console.log(label);
  console.log(
    `  ${outcome.approved ? "APPROVED" : "REFUSED "}  ${outcome.reason}`,
  );
  console.log();
}

console.log("Tutorial 119: human approval for one action");
console.log();

await step(
  "1. A refund of 5000 with no manager approval: refused, every refund needs one (the agent's own claims are not enough)",
  { target: "payments/pay_ORD1001", amount: 5_000 },
  false,
);

await step(
  "2. A refund of 75000 with no manager approval: refused (the server also writes a signed Refusal Record a manager can review)",
  { target: "payments/pay_ORD1042", amount: 75_000 },
  false,
);

console.log(
  "The manager reviews the refusal and signs: this payment, up to 75000, 15 minutes, once.",
);
console.log();
const approval = await managerSigns("payments/pay_ORD1042", 75_000);

await step(
  "3. The agent sends a new request with the signed approval: approved",
  { target: "payments/pay_ORD1042", amount: 75_000, approval },
  true,
);

// Just before release, the gateway checks the same approval again without using it up.
const releaseViolations = await approvalSignals.findViolations(
  verificationRequest(
    { target: "payments/pay_ORD1042", amount: 75_000, approval },
    "release",
  ),
  signalsFor({ target: "payments/pay_ORD1042", amount: 75_000, approval }),
);
results.push({
  step: "3b. Gateway re-check",
  expected: true,
  actual: releaseViolations.length === 0,
});
console.log("3b. The gateway checks the approval again just before release");
console.log(
  `  ${releaseViolations.length === 0 ? "PASSED  " : "FAILED  "}  release stage, approval verified, not consumed`,
);
console.log();

await step(
  "4. The same approval sent again on another request: refused, an approval is used once",
  { target: "payments/pay_ORD1042", amount: 75_000, approval },
  false,
);

await step(
  "5. An approval up to 75000 used for a refund of 90000: refused, the amount comes from the request",
  {
    target: "payments/pay_ORD1042",
    amount: 90_000,
    approval: await managerSigns("payments/pay_ORD1042", 75_000),
  },
  false,
);

await step(
  "6. An approval for one payment used for another: refused",
  {
    target: "payments/pay_ORD2000",
    amount: 50_000,
    approval: await managerSigns("payments/pay_ORD1042", 50_000),
  },
  false,
);

await step(
  "7. A refund on a payment the source says is fully refunded, with an approval: refused, the source must confirm first",
  {
    target: "payments/pay_ORD3000",
    amount: 20_000,
    approval: await managerSigns("payments/pay_ORD3000", 20_000),
  },
  false,
);

const failed = results.filter((r) => r.expected !== r.actual);

if (failed.length > 0) {
  for (const r of failed) {
    console.log(`✗ ${r.step}: expected ${r.expected}, got ${r.actual}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `✓ All ${results.length} steps behaved as the policy and the approval rules require.`,
  );
}

console.log();
console.log("Tutorial Complete");
