import { generateKeyPairSync } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { StaticApprovalIssuerRegistry } from "@parmana/approval";
import { ApprovalArtifactSigner } from "@parmana/crypto";

import {
  REFUND_ACTION,
  RefundGate,
  loadRefundPolicy,
  type GateDecision,
  type RefundRequest,
} from "./refund-gate.js";

/**
 * Google AX refund, end to end through the Parmana gate.
 *
 * An agent (running in Google AX in production; here a plain function) proposes
 * a refund. The gate runs the real customer-refund 1.2.0 policy and the approval
 * check at authorize, then again at release, just before the connector would run.
 * The release check uses the trust list as it stands at that moment, so a
 * manager revoked between the two stages is refused at release.
 *
 * Hermetic: the manager key is generated here, and nonces are in memory.
 */

const repoRoot = dirname(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
);
const policy = loadRefundPolicy(repoRoot);

const manager = generateKeyPairSync("ed25519");
const MANAGER = { approverId: "manager-priya", keyId: "manager-priya-key-1" };

// The trust list as the operator has it before revocation.
const trusted = new StaticApprovalIssuerRegistry([
  { ...MANAGER, publicKey: manager.publicKey, revoked: false },
]);
// The same manager after revocation. Only the revoked flag differs.
const revoked = new StaticApprovalIssuerRegistry([
  { ...MANAGER, publicKey: manager.publicKey, revoked: true },
]);

const gate = new RefundGate(policy);

async function managerSigns(orderId: string, maxAmount: number) {
  return new ApprovalArtifactSigner().sign(
    {
      ...MANAGER,
      capability: REFUND_ACTION,
      resourceId: orderId,
      scope: { field: "value", comparator: "lte", value: maxAmount },
      ttlSeconds: 900,
    },
    manager.privateKey,
  );
}

let requestNumber = 0;
const nextId = () => `ax-refund-${++requestNumber}`;

interface Step {
  readonly label: string;
  readonly expected: boolean;
  readonly actual: boolean;
  readonly reason: string;
}
const steps: Step[] = [];

function record(
  label: string,
  expected: boolean,
  decision: GateDecision,
): void {
  steps.push({
    label,
    expected,
    actual: decision.approved,
    reason: decision.reason,
  });
  console.log(label);
  console.log(
    `  ${decision.approved ? "APPROVED" : "REFUSED "}  [${decision.stage}] ${decision.reason}`,
  );
  console.log();
}

console.log("Google AX refund through the Parmana gate");
console.log();

// 1. No approval: refused at authorize, the connector never runs.
record(
  "1. Refund of 5000 with no manager approval: refused",
  false,
  await gate.authorize(
    { orderId: "ORD-1001", amount: 5_000, managerApproved: false },
    trusted,
    nextId(),
  ),
);

// 2. Approved, then the manager is still trusted at release: the refund may run.
const approvedRefund: RefundRequest = {
  orderId: "ORD-1042",
  amount: 75_000,
  managerApproved: true,
  approval: await managerSigns("ORD-1042", 75_000),
};
record(
  "2. Refund of 75000 with a signed approval, trusted at authorize: approved",
  true,
  await gate.authorize(approvedRefund, trusted, nextId()),
);
record(
  "2b. The same approval re-checked at release, manager still trusted: approved",
  true,
  await gate.release(approvedRefund, trusted, nextId()),
);

// 3. Approved at authorize, then the manager is revoked before release.
const revokedRefund: RefundRequest = {
  orderId: "ORD-5000",
  amount: 60_000,
  managerApproved: true,
  approval: await managerSigns("ORD-5000", 60_000),
};
record(
  "3a. Refund of 60000 with a signed approval, trusted at authorize: approved",
  true,
  await gate.authorize(revokedRefund, trusted, nextId()),
);
record(
  "3b. The manager is revoked, then the release check runs: refused before the connector",
  false,
  await gate.release(revokedRefund, revoked, nextId()),
);

// 4. The approval already used at step 2 is refused on a new request.
record(
  "4. The approval from step 2 sent again: refused, an approval is used once",
  false,
  await gate.authorize(approvedRefund, trusted, nextId()),
);

// 5. An approval for 75000 cannot cover a 90000 refund.
record(
  "5. Approval up to 75000 used for 90000: refused",
  false,
  await gate.authorize(
    {
      orderId: "ORD-1042",
      amount: 90_000,
      managerApproved: true,
      approval: await managerSigns("ORD-1042", 75_000),
    },
    trusted,
    nextId(),
  ),
);

// 6. Above the policy maximum, even with an approval.
record(
  "6. Refund of 150000 with an approval: refused by the policy maximum",
  false,
  await gate.authorize(
    {
      orderId: "ORD-3000",
      amount: 150_000,
      managerApproved: true,
      approval: await managerSigns("ORD-3000", 150_000),
    },
    trusted,
    nextId(),
  ),
);

const failed = steps.filter((s) => s.expected !== s.actual);
if (failed.length > 0) {
  for (const s of failed) {
    console.log(
      `✗ ${s.label}: expected ${s.expected}, got ${s.actual} (${s.reason})`,
    );
  }
  process.exitCode = 1;
} else {
  console.log(
    `✓ All ${steps.length} steps behaved as the policy and the approval rules require.`,
  );
}
