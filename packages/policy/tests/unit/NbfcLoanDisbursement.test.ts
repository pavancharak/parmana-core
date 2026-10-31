import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PolicyEngine } from "../../src/PolicyEngine.js";
import { PolicyOutcome } from "../../src/types/PolicyOutcome.js";
import type { Policy } from "../../src/types/Policy.js";
import type { PolicySignals } from "../../src/types/PolicySignals.js";

/**
 * Replays the reported ICICI Bank pattern (Oct 8-9, 2026): more than 700
 * unauthorised instant transfers, about $2 million in total, each one below
 * the per-transaction limit. The policy's signals are computed here the way
 * an independent check would compute them. The rolling velocity window is an
 * in-memory stand-in for the lender's real activity store.
 */

const PER_TRANSACTION_LIMIT = 500_000; // Rs 5 lakh
const DAILY_COUNT_LIMIT = 10;
const DAILY_TOTAL_LIMIT = 2_500_000; // Rs 25 lakh
const TRANSFER_AMOUNT = 240_000; // Rs 2.4 lakh, under the per-transaction limit
const ATTACK_TRANSFERS = 700;

const policy = JSON.parse(
  readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../../../policies/nbfc-loan-disbursement/1.0.0/policy.json",
    ),
    "utf8",
  ),
) as Policy;

const engine = new PolicyEngine();

class DailyVelocityWindow {
  private count = 0;
  private total = 0;

  /** True when one more disbursement of `amount` stays within both limits. */
  allows(amount: number): boolean {
    return (
      this.count + 1 <= DAILY_COUNT_LIMIT &&
      this.total + amount <= DAILY_TOTAL_LIMIT
    );
  }

  record(amount: number): void {
    this.count += 1;
    this.total += amount;
  }
}

function disbursement(overrides: PolicySignals): PolicySignals {
  return {
    humanApproved: false,
    loanAccountApproved: true,
    beneficiaryAllowed: false,
    withinDisbursementLimit: true,
    withinAggregateVelocityLimit: true,
    disbursementAmount: TRANSFER_AMOUNT,
    loanAccountId: "loan-2026-0457",
    ...overrides,
  };
}

describe("NBFC loan disbursement against the reported ICICI pattern", () => {
  it("a per-transaction cap alone would allow every attacker transfer", () => {
    const total = ATTACK_TRANSFERS * TRANSFER_AMOUNT;

    expect(TRANSFER_AMOUNT).toBeLessThanOrEqual(PER_TRANSACTION_LIMIT);
    expect(total).toBe(168_000_000); // Rs 16.8 crore, about $2 million
  });

  it("refuses all 700 transfers when no approval is present", () => {
    const outcomes = Array.from(
      { length: ATTACK_TRANSFERS },
      () => engine.evaluate(policy, disbursement({})).outcome,
    );

    expect(outcomes.every((outcome) => outcome === PolicyOutcome.REJECT)).toBe(
      true,
    );
  });

  it("refuses the transfers even with an approval, once the velocity window is full", () => {
    // Worst case: an approval exists for every transfer (for example, a
    // compromised approver or a bulk approval). The velocity signal still
    // stops the run.
    const window = new DailyVelocityWindow();
    let approved = 0;

    for (let index = 0; index < ATTACK_TRANSFERS; index += 1) {
      const withinVelocity = window.allows(TRANSFER_AMOUNT);
      const decision = engine.evaluate(
        policy,
        disbursement({
          humanApproved: true,
          beneficiaryAllowed: true,
          withinAggregateVelocityLimit: withinVelocity,
        }),
      );

      if (decision.outcome === PolicyOutcome.APPROVE) {
        approved += 1;
        window.record(TRANSFER_AMOUNT);
      }
    }

    expect(approved).toBe(DAILY_COUNT_LIMIT);
    expect(approved * TRANSFER_AMOUNT).toBeLessThanOrEqual(DAILY_TOTAL_LIMIT);
  });

  it("refuses a transfer to a beneficiary not on the approved loan, even with an approval and within velocity", () => {
    const decision = engine.evaluate(
      policy,
      disbursement({ humanApproved: true, beneficiaryAllowed: false }),
    );

    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
  });
});
