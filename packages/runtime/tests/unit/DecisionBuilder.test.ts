import { describe, expect, it } from "vitest";

import type { BusinessTransaction } from "@parmana/shared";
import { PolicyOutcome, type PolicyDecision } from "@parmana/policy";

import { DecisionBuilder } from "../../src/DecisionBuilder.js";

function transaction(): BusinessTransaction {
  return {
    intent: { intentId: "intent-001" },
    policy: {
      name: "customer-refund",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    },
    signals: { refundEligible: true },
  } as unknown as BusinessTransaction;
}

function policyDecision(
  overrides: Partial<PolicyDecision> = {},
): PolicyDecision {
  return {
    policyId: "customer-refund",
    policyVersion: "1.0.0",
    outcome: PolicyOutcome.APPROVE,
    reason: "Refund authorized.",
    matchedRuleId: "approve-refund",
    evaluatedRules: 3,
    matchedPath: [
      "reject-excessive-refund",
      "reject-fraud-check",
      "approve-refund",
    ],
    ...overrides,
  };
}

/**
 * docs/VERIFICATION-GAPS.md G-44: PolicyEngine.evaluate() computes a
 * structured rule-match trace (matchedRuleId/evaluatedRules/matchedPath)
 * that DecisionBuilder previously discarded before producing the
 * Decision that actually gets persisted and signed. These tests prove
 * the trace now survives into the built Decision, verbatim.
 */
describe("DecisionBuilder", () => {
  it("carries matchedRuleId, evaluatedRules, and matchedPath through from the PolicyDecision", () => {
    const decision = new DecisionBuilder().build(
      transaction(),
      policyDecision(),
    );

    expect(decision.matchedRuleId).toBe("approve-refund");
    expect(decision.evaluatedRules).toBe(3);
    expect(decision.matchedPath).toEqual([
      "reject-excessive-refund",
      "reject-fraud-check",
      "approve-refund",
    ]);
  });

  it("carries the trace through on a REJECT decision too, not only APPROVE", () => {
    const decision = new DecisionBuilder().build(
      transaction(),
      policyDecision({
        outcome: PolicyOutcome.REJECT,
        reason:
          "Refund rejected because the transaction did not pass fraud assessment.",
        matchedRuleId: "reject-fraud-check",
        evaluatedRules: 2,
        matchedPath: ["reject-excessive-refund", "reject-fraud-check"],
      }),
    );

    expect(decision.outcome).toBe("REJECTED");
    expect(decision.matchedRuleId).toBe("reject-fraud-check");
    expect(decision.matchedPath).toEqual([
      "reject-excessive-refund",
      "reject-fraud-check",
    ]);
  });

  it("still preserves the existing outcome/reason/signals fields unchanged", () => {
    const decision = new DecisionBuilder().build(
      transaction(),
      policyDecision(),
    );

    expect(decision.outcome).toBe("APPROVED");
    expect(decision.reason).toBe("Refund authorized.");
    expect(decision.signals).toEqual({ refundEligible: true });
    expect(decision.intentId).toBe("intent-001");
  });
});
