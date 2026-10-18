import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PolicyEngine } from "../../src/PolicyEngine.js";
import { PolicyValidator } from "../../src/PolicyValidator.js";
import { PolicyOutcome } from "../../src/types/PolicyOutcome.js";
import type { Policy } from "../../src/types/Policy.js";
import type { PolicySignals } from "../../src/types/PolicySignals.js";

/**
 * customer-refund 1.1.0 (G-65): refunds up to 10000 are automatic,
 * refunds above 10000 and up to 100000 need a manager approval, refunds
 * above 100000 are refused. managerApproved is only a policy fact here;
 * that it is backed by a signed approval is declared in approvalSignals
 * and enforced by @parmana/approval's ApprovalSignalVerifier, tested
 * there and in the paytm-refund integration test.
 */
describe("customer-refund 1.1.0", () => {
  const policy = JSON.parse(
    readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../../policies/customer-refund/1.1.0/policy.json",
      ),
      "utf8",
    ),
  ) as Policy;

  const engine = new PolicyEngine();

  function signals(overrides: Partial<PolicySignals>): PolicySignals {
    return {
      refundEligible: true,
      managerApproved: false,
      fraudCheckPassed: true,
      refundAmount: 500,
      ...overrides,
    };
  }

  it("is refused at load, since its automatic refunds need no signed human approval", () => {
    expect(() => new PolicyValidator().validate(policy)).toThrow(
      /'approve-refund-automatic' approves without a signed human approval/,
    );
    expect(policy.policyVersion).toBe("1.1.0");
  });

  it("declares managerApproved as approval backed, for the order and amount in the Intent", () => {
    expect(policy.approvalSignals).toEqual({
      managerApproved: {
        resourceId: "parameters.orderId",
        value: "parameters.amount",
      },
    });
  });

  it.each([
    ["a small refund, no manager", {}, "approve-refund-automatic"],
    [
      "exactly the automatic limit",
      { refundAmount: 10_000 },
      "approve-refund-automatic",
    ],
    [
      "just above the automatic limit, no manager",
      { refundAmount: 10_001 },
      "reject-manager-approval-required",
    ],
    [
      "above the automatic limit, with manager approval",
      { refundAmount: 75_000, managerApproved: true },
      "approve-refund-with-manager-approval",
    ],
    [
      "exactly the maximum, with manager approval",
      { refundAmount: 100_000, managerApproved: true },
      "approve-refund-with-manager-approval",
    ],
    [
      "above the maximum, with manager approval",
      { refundAmount: 100_001, managerApproved: true },
      "reject-above-maximum",
    ],
    [
      "failed fraud check, with manager approval",
      { fraudCheckPassed: false, managerApproved: true },
      "reject-fraud-check",
    ],
    [
      "not eligible, with manager approval",
      { refundEligible: false, managerApproved: true },
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

  it("refuses when eligibility and fraud signals are missing", () => {
    const decision = engine.evaluate(policy, { refundAmount: 500 });

    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
    expect(decision.matchedRuleId).toBe("reject-default");
  });
});
