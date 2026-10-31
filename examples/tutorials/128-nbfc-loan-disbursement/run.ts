// Tutorial 128: The nbfc-loan-disbursement 1.0.0 policy approves a loan
// disbursement only when every condition holds and a verified human approval
// is present. Each condition has a named refusal, and a rolling velocity limit
// stops a run even when every transfer is approved. Pure policy evaluation,
// no server.
//
// This tutorial supplies the four facts other than humanApproved itself. In
// production they must come from registered business signal sources. The live
// policy does not declare those sources yet; see README.md.
process.env.NODE_ENV = "test";

import { readFileSync } from "node:fs";
import path from "node:path";

const { PolicyEngine } =
  await import("../../../packages/policy/src/PolicyEngine.js");
const { PolicyOutcome } =
  await import("../../../packages/policy/src/types/PolicyOutcome.js");

const policy = JSON.parse(
  readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../../policies/nbfc-loan-disbursement/1.0.0/policy.json",
    ),
    "utf8",
  ),
);

const engine = new PolicyEngine();

const AMOUNT = 240_000; // Rs 2.4 lakh, under the Rs 5 lakh per-transaction limit
const LOAN_ID = "loan-2026-0457";
const DAILY_COUNT_LIMIT = 10;
const DAILY_TOTAL_LIMIT = 2_500_000; // Rs 25 lakh

const approvedFacts = {
  humanApproved: true,
  loanAccountApproved: true,
  beneficiaryAllowed: true,
  withinDisbursementLimit: true,
  withinAggregateVelocityLimit: true,
  disbursementAmount: AMOUNT,
  loanAccountId: LOAN_ID,
};

console.log();
console.log("==================================================");
console.log("Tutorial 128 - NBFC Loan Disbursement");
console.log("==================================================");
console.log();

function expect(
  label: string,
  actual: { outcome: string; matchedRuleId: string },
  outcome: string,
  ruleId: string,
) {
  const ok = actual.outcome === outcome && actual.matchedRuleId === ruleId;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}: ${actual.outcome} (${actual.matchedRuleId})`,
  );
  if (!ok) {
    throw new Error(`${label}: expected ${outcome} (${ruleId})`);
  }
}

console.log("Every condition holds, with a verified human approval");
expect(
  "a disbursement inside every limit is approved",
  engine.evaluate(policy, approvedFacts),
  PolicyOutcome.APPROVE,
  "approve-loan-disbursement",
);

console.log();
console.log("Each condition refuses, and the refusal names that condition");
expect(
  "an unapproved loan account is refused",
  engine.evaluate(policy, { ...approvedFacts, loanAccountApproved: false }),
  PolicyOutcome.REJECT,
  "reject-loan-account-not-approved",
);
expect(
  "a beneficiary not on the loan is refused",
  engine.evaluate(policy, { ...approvedFacts, beneficiaryAllowed: false }),
  PolicyOutcome.REJECT,
  "reject-beneficiary-not-allowed",
);
expect(
  "an amount over the per-transaction limit is refused",
  engine.evaluate(policy, { ...approvedFacts, withinDisbursementLimit: false }),
  PolicyOutcome.REJECT,
  "reject-disbursement-limit-exceeded",
);
expect(
  "a lender over its rolling velocity limit is refused",
  engine.evaluate(policy, {
    ...approvedFacts,
    withinAggregateVelocityLimit: false,
  }),
  PolicyOutcome.REJECT,
  "reject-aggregate-velocity-exceeded",
);
expect(
  "a zero amount is refused",
  engine.evaluate(policy, { ...approvedFacts, disbursementAmount: 0 }),
  PolicyOutcome.REJECT,
  "reject-invalid-disbursement-amount",
);
expect(
  "no human approval is refused by the default rule",
  engine.evaluate(policy, { ...approvedFacts, humanApproved: false }),
  PolicyOutcome.REJECT,
  "reject-default",
);

console.log();
console.log(
  "A velocity limit stops a run even when every transfer is approved",
);
let count = 0;
let total = 0;
let approved = 0;
for (let index = 0; index < 700; index += 1) {
  const withinVelocity =
    count + 1 <= DAILY_COUNT_LIMIT && total + AMOUNT <= DAILY_TOTAL_LIMIT;
  const decision = engine.evaluate(policy, {
    ...approvedFacts,
    withinAggregateVelocityLimit: withinVelocity,
  });

  if (decision.outcome === PolicyOutcome.APPROVE) {
    approved += 1;
    count += 1;
    total += AMOUNT;
  }
}
const velocityOk = approved === DAILY_COUNT_LIMIT;
console.log(
  `${velocityOk ? "PASS" : "FAIL"}  700 approved transfers: ${approved} approved, the rest stopped by the velocity limit`,
);
if (!velocityOk) {
  throw new Error(`expected ${DAILY_COUNT_LIMIT} approvals, got ${approved}`);
}

console.log();
console.log("All checks passed.");
