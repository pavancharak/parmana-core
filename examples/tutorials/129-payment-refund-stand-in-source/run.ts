import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

//
// Refund a payment with a payment source that confirms the refund is
// allowed. Uses the live policy policies/payment-refund/1.0.0/policy.json.
//
// The policy needs two things the caller cannot declare:
//   * paymentRefundable: a trusted source (named "razorpay" in the policy)
//     must confirm the payment is refundable. Parmana asks the source
//     itself; the caller's signals do not count.
//   * managerApproved: a signed approval from a manager, for this payment
//     and at least this amount, used once.
//
// The payment source here is a STAND-IN: an in-process table of payments,
// so the example runs without a payment provider. In production the source
// is the payment provider's signal service, registered with Parmana, and
// answers over signed HTTPS. The steps below run the same resolver,
// policy and approval checks that the runtime runs.
//
// Hermetic: the manager key is generated in memory and nonces are kept in
// memory. Production managers sign on their own machine with
// scripts/sign-approval.ts; see docs/site/guides/policy-lifecycle-and-approvals.mdx.
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

// The stand-in payment source. Keys are the Intent targets.
const PAYMENTS: Record<string, { refundable: boolean }> = {
  "payments/pay_ABC123": { refundable: true },
  "payments/pay_DEF456": { refundable: false },
};
const OFFLINE_TARGET = "payments/pay_OFFLINE";

const now = new Date();
const paymentSource: BusinessSignalSource = {
  name: "razorpay",
  resolve: async (query) => {
    if (query.subject === OFFLINE_TARGET) {
      // The payment provider cannot be reached. Parmana fails closed.
      throw new Error("payment provider timed out");
    }
    const payment = PAYMENTS[query.subject];
    if (payment === undefined) {
      return { kind: "not_found", reason: "no such payment" };
    }
    return {
      kind: "observed",
      value: payment.refundable,
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

function verificationRequest(
  refund: RefundRequest,
  stage: "authorize" | "release",
): SignalStateVerificationRequest {
  return {
    action: ACTION,
    businessTransactionId: `tutorial-129-${requestNumber}`,
    intentParameters: { amount: refund.amount },
    intentTarget: refund.target,
    stage,
    policy,
  };
}

/** The policy, the trusted source and the approval check, in the runtime's order. */
async function decide(
  refund: RefundRequest,
): Promise<{ approved: boolean; reason: string }> {
  requestNumber += 1;

  // 1. The trusted source. The caller proposes only the amount.
  const resolved = await resolver.resolve({
    policy,
    action: ACTION,
    businessTransactionId: `tutorial-129-${requestNumber}`,
    intent: {
      target: refund.target,
      parameters: { amount: refund.amount },
    },
    proposedSignals: { refundAmount: refund.amount },
  });

  if (resolved.assessment.status !== BusinessValidationStatus.VALID) {
    return {
      approved: false,
      reason: `business validation ${resolved.assessment.status}: ${resolved.assessment.reason ?? "the payment source did not confirm"}`,
    };
  }

  // 2. The policy, with the trusted values and the caller's amount.
  const signals: PolicySignals = {
    refundAmount: refund.amount,
    ...resolved.trustedValues,
    ...(refund.approval !== undefined && {
      approvalArtifact: JSON.parse(JSON.stringify(refund.approval)),
    }),
    managerApproved: refund.approval !== undefined,
  };
  const decision = engine.evaluate(policy, signals);

  if (decision.outcome !== PolicyOutcome.APPROVE) {
    return {
      approved: false,
      reason: `${decision.matchedRuleId}: ${decision.reason}`,
    };
  }

  // 3. The manager's approval, for this payment and amount, used once.
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

console.log(
  "Tutorial 129: refund with a payment source and a manager approval",
);
console.log();

await step(
  "1. A refund on a payment the source says is fully refunded: refused, the source does not confirm it is refundable",
  { target: "payments/pay_DEF456", amount: 5_000 },
  false,
);

await step(
  "2. A refund on a refundable payment with no manager approval: refused, neither tier applies",
  { target: "payments/pay_ABC123", amount: 5_000 },
  false,
);

console.log(
  "The manager reviews the payment and signs: this payment, up to 5000, 15 minutes, once.",
);
console.log();
const approval = await managerSigns("payments/pay_ABC123", 5_000);

await step(
  "3. The same refund with the signed approval: approved",
  { target: "payments/pay_ABC123", amount: 5_000, approval },
  true,
);

await step(
  "4. The same approval sent again: refused, an approval is used once",
  { target: "payments/pay_ABC123", amount: 5_000, approval },
  false,
);

await step(
  "5. An approval for 5000 used for a refund of 6000: refused, the approval does not cover the amount",
  {
    target: "payments/pay_ABC123",
    amount: 6_000,
    approval: await managerSigns("payments/pay_ABC123", 5_000),
  },
  false,
);

await step(
  "6. A refund when the payment provider cannot be reached: refused, Parmana fails closed",
  { target: OFFLINE_TARGET, amount: 5_000 },
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
    `✓ All ${results.length} steps behaved as the policy, the source and the approval rules require.`,
  );
}

console.log();
console.log("Tutorial Complete");
