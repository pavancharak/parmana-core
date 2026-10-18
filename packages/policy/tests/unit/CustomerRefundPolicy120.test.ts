import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PolicyEngine } from "../../src/PolicyEngine.js";
import { PolicyValidator } from "../../src/PolicyValidator.js";
import { PolicyOutcome } from "../../src/types/PolicyOutcome.js";
import type { Policy } from "../../src/types/Policy.js";
import type { PolicySignals } from "../../src/types/PolicySignals.js";

/**
 * customer-refund 1.2.0 (G-75): every refund needs a manager approval,
 * refunds of 0 or less and above 100000 are refused. In 1.1.0 a refund
 * up to 10000 was approved on the caller's word that it was eligible and
 * passed the fraud check. managerApproved is backed by a signed approval
 * through approvalSignals, enforced by ApprovalSignalVerifier.
 */
describe("customer-refund 1.2.0", () => {
  const policy = JSON.parse(
    readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../../policies/customer-refund/1.2.0/policy.json",
      ),
      "utf8",
    ),
  ) as Policy;

  const engine = new PolicyEngine();

  function signals(overrides: Partial<PolicySignals>): PolicySignals {
    return {
      refundEligible: true,
      managerApproved: true,
      fraudCheckPassed: true,
      refundAmount: 500,
      ...overrides,
    };
  }

  it("is a valid policy with the same approval declaration as 1.1.0", () => {
    expect(() => new PolicyValidator().validate(policy)).not.toThrow();
    expect(policy.policyVersion).toBe("1.2.0");
    expect(policy.approvalSignals).toEqual({
      managerApproved: {
        resourceId: "parameters.orderId",
        value: "parameters.amount",
      },
    });
  });

  it.each([
    [
      "a small refund, no manager",
      { managerApproved: false },
      "reject-manager-approval-required",
    ],
    [
      "a small refund, with manager approval",
      {},
      "approve-refund-with-manager-approval",
    ],
    [
      "above the old automatic limit, with manager approval",
      { refundAmount: 75_000 },
      "approve-refund-with-manager-approval",
    ],
    [
      "exactly the maximum, with manager approval",
      { refundAmount: 100_000 },
      "approve-refund-with-manager-approval",
    ],
    [
      "above the maximum, with manager approval",
      { refundAmount: 100_001 },
      "reject-above-maximum",
    ],
    ["a refund of 0", { refundAmount: 0 }, "reject-invalid-amount"],
    ["a negative refund", { refundAmount: -5 }, "reject-invalid-amount"],
    [
      "failed fraud check, with manager approval",
      { fraudCheckPassed: false },
      "reject-fraud-check",
    ],
    [
      "not eligible, with manager approval",
      { refundEligible: false },
      "reject-not-eligible",
    ],
  ] as const)("%s", (_name, overrides, expectedRuleId) => {
    const decision = engine.evaluate(policy, signals(overrides));

    expect(decision.matchedRuleId).toBe(expectedRuleId);
    expect(decision.outcome).toBe(
      expectedRuleId.startsWith("approve")
        ? PolicyOutcome.APPROVE
        : PolicyOutcome.REJECT,
    );
  });

  it("refuses when the manager signal is missing", () => {
    const decision = engine.evaluate(policy, {
      refundEligible: true,
      fraudCheckPassed: true,
      refundAmount: 500,
    });

    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
    expect(decision.matchedRuleId).toBe("reject-manager-approval-required");
  });
});
