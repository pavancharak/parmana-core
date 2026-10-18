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
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import {
  PolicyEngine,
  PolicyOutcome,
  PolicyValidator,
  type Policy,
  type PolicySignals,
  type SignalStateVerificationRequest,
} from "@parmana/policy";
import type { SignedApproval } from "@parmana/shared";

//
// Human approval for one action: a person signs off on a single refund.
//
// The real policy policies/customer-refund/1.2.0/policy.json says:
//   * above 0 and up to 100000, a refund needs managerApproved;
//   * 0 or less, or above 100000, it is refused, approval or not.
// (1.1.0 approved a refund up to 10000 on the agent's word alone that it
// was eligible and passed the fraud check; 1.2.0 closes that, G-75.)
//
// managerApproved is declared in the policy's approvalSignals, so an
// agent cannot just send `managerApproved: true`. The signal counts
// only with a signed approval artifact from a trusted approver, for
// this order (parameters.orderId) and at least this amount
// (parameters.amount, taken from the request, never from the agent's
// signals), not expired and never used before. ApprovalSignalVerifier
// checks it before authorization and again, without using it up, at
// the gateway just before release.
//
// This tutorial runs those real components in the order RuntimeEngine
// runs them: the policy first, then, only for a provisional APPROVE, the
// approval check. Hermetic: an in memory nonce store, and a manager key
// made here. In production the manager runs scripts/generate-approver-key.ts
// on their own machine, the operator adds the public key to
// TRUSTED_APPROVAL_ISSUERS and deploys, and the manager signs with
// scripts/sign-approval.ts. See docs/site/guides/policy-lifecycle-and-approvals.mdx.
//

const repoRoot = dirname(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
);

const policy = JSON.parse(
  readFileSync(
    join(repoRoot, "policies", "customer-refund", "1.2.0", "policy.json"),
    "utf8",
  ),
) as Policy;
new PolicyValidator().validate(policy);

// The manager's key pair. Only the public half is trusted by the server.
const manager = generateKeyPairSync("ed25519");
const MANAGER = { approverId: "manager-priya", keyId: "manager-priya-key-1" };

const approvalVerifier = new ApprovalVerifier({
  crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
  issuerRegistry: new StaticApprovalIssuerRegistry([
    { ...MANAGER, publicKey: manager.publicKey, revoked: false },
  ]),
  nonceStore: new MemoryNonceStore(),
});
const approvalSignals = new ApprovalSignalVerifier(approvalVerifier);
const engine = new PolicyEngine();

let requestNumber = 0;

interface RefundRequest {
  readonly orderId: string;
  readonly amount: number;
  readonly managerApproved: boolean;
  readonly approval?: SignedApproval;
}

function verificationRequest(
  refund: RefundRequest,
  stage: "authorize" | "release",
): SignalStateVerificationRequest {
  return {
    action: "paytm:refund",
    businessTransactionId: `tutorial-119-${requestNumber}`,
    intentParameters: { orderId: refund.orderId, amount: refund.amount },
    intentTarget: `orders/${refund.orderId}`,
    stage,
    policy,
  };
}

function signalsFor(refund: RefundRequest): PolicySignals {
  return {
    refundEligible: true,
    fraudCheckPassed: true,
    refundAmount: refund.amount,
    managerApproved: refund.managerApproved,
    // Arrives over HTTP as JSON inside the request's signals.
    ...(refund.approval !== undefined && {
      approvalArtifact: JSON.parse(JSON.stringify(refund.approval)),
    }),
  };
}

/** The policy, then the approval check, as RuntimeEngine orders them. */
async function decide(
  refund: RefundRequest,
): Promise<{ approved: boolean; reason: string }> {
  requestNumber += 1;
  const signals = signalsFor(refund);
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

  return { approved: true, reason: `${decision.matchedRuleId}` };
}

async function managerSigns(
  orderId: string,
  maxAmount: number,
): Promise<SignedApproval> {
  return new ApprovalArtifactSigner().sign(
    {
      ...MANAGER,
      capability: "paytm:refund",
      resourceId: orderId,
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
  "1. A refund of 5000 with no manager: refused, every refund needs one (the agent's own eligibility and fraud claims are not enough)",
  { orderId: "ORD-1001", amount: 5000, managerApproved: false },
  false,
);

await step(
  "2. A refund of 75000 with no manager: refused (the server also writes a signed Refusal Record a manager can review)",
  { orderId: "ORD-1042", amount: 75_000, managerApproved: false },
  false,
);

await step(
  "3. The agent sends managerApproved: true with no approval: refused",
  { orderId: "ORD-1042", amount: 75_000, managerApproved: true },
  false,
);

console.log(
  "The manager reviews the refusal and signs: this order, up to 75000, 15 minutes, once.",
);
console.log();
const approval = await managerSigns("ORD-1042", 75_000);

await step(
  "4. The agent sends a new request with the signed approval: approved",
  { orderId: "ORD-1042", amount: 75_000, managerApproved: true, approval },
  true,
);

// Just before release, the gateway checks the same approval again. The
// release check verifies without using the approval up.
const releaseViolations = await approvalSignals.findViolations(
  verificationRequest(
    { orderId: "ORD-1042", amount: 75_000, managerApproved: true, approval },
    "release",
  ),
  signalsFor({
    orderId: "ORD-1042",
    amount: 75_000,
    managerApproved: true,
    approval,
  }),
);
results.push({
  step: "4b. Gateway re-check",
  expected: true,
  actual: releaseViolations.length === 0,
});
console.log("4b. The gateway checks the approval again just before release");
console.log(
  `  ${releaseViolations.length === 0 ? "PASSED  " : "FAILED  "}  release stage, approval verified, not consumed`,
);
console.log();

await step(
  "5. The same approval sent again on another request: refused, an approval is used once",
  { orderId: "ORD-1042", amount: 75_000, managerApproved: true, approval },
  false,
);

await step(
  "6. An approval up to 75000 used for 90000: refused, the amount comes from the request",
  {
    orderId: "ORD-1042",
    amount: 90_000,
    managerApproved: true,
    approval: await managerSigns("ORD-1042", 75_000),
  },
  false,
);

await step(
  "7. An approval for another order: refused",
  {
    orderId: "ORD-2000",
    amount: 50_000,
    managerApproved: true,
    approval: await managerSigns("ORD-1042", 50_000),
  },
  false,
);

await step(
  "8. A refund of 150000, even with an approval: refused by the policy maximum",
  {
    orderId: "ORD-3000",
    amount: 150_000,
    managerApproved: true,
    approval: await managerSigns("ORD-3000", 150_000),
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
