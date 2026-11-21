import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PolicyEngine } from "../../src/PolicyEngine.js";
import { PolicyValidator } from "../../src/PolicyValidator.js";
import { PolicyOutcome } from "../../src/types/PolicyOutcome.js";
import type { Policy } from "../../src/types/Policy.js";
import type { PolicySignals } from "../../src/types/PolicySignals.js";

/**
 * The live payment-refund 1.0.0 policy (policies/payment-refund/1.0.0/policy.json),
 * the only policy in production. The rules are evaluated here with the same file
 * production loads, so these tests cover what production decides.
 *
 * The payment source and the manager approval are supplied as signals, as the
 * runtime supplies them after its own checks. This suite tests the decision rules.
 */
describe("live payment-refund 1.0.0", () => {
  const policy = JSON.parse(
    readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../../policies/payment-refund/1.0.0/policy.json",
      ),
      "utf8",
    ),
  ) as Policy;

  const engine = new PolicyEngine();

  function signals(overrides: Partial<PolicySignals>): PolicySignals {
    return {
      paymentRefundable: true,
      managerApproved: true,
      refundAmount: 500,
      ...overrides,
    };
  }

  it("is a valid policy and is the live file for this policy", () => {
    expect(() => new PolicyValidator().validate(policy)).not.toThrow();
    expect(policy.policyId).toBe("payment-refund");
    expect(policy.policyVersion).toBe("1.0.0");
  });

  it.each([
    [
      "refundable payment, signed manager approval for the amount",
      {},
      "tier-2-with-exact-approval",
      PolicyOutcome.APPROVE,
    ],
    [
      "refundable payment, no manager approval",
      { managerApproved: false },
      "reject-by-default",
      PolicyOutcome.REJECT,
    ],
    [
      "payment not refundable, with manager approval",
      { paymentRefundable: false },
      "refuse-not-refundable",
      PolicyOutcome.REJECT,
    ],
    [
      "payment not refundable, no manager approval",
      { paymentRefundable: false, managerApproved: false },
      "refuse-not-refundable",
      PolicyOutcome.REJECT,
    ],
  ] as const)("%s", (_name, overrides, expectedRuleId, expectedOutcome) => {
    const decision = engine.evaluate(policy, signals(overrides));

    expect(decision.matchedRuleId).toBe(expectedRuleId);
    expect(decision.outcome).toBe(expectedOutcome);
  });

  it("refuses with the reason the policy gives, not a generic one", () => {
    const decision = engine.evaluate(
      policy,
      signals({ paymentRefundable: false }),
    );

    expect(decision.reason).toBe(
      "Refund refused. The payment source does not confirm the payment is refundable for this amount.",
    );
  });

  it("approves only when both the payment source and the manager approval hold", () => {
    expect(
      engine.evaluate(policy, signals({ managerApproved: false })).outcome,
    ).toBe(PolicyOutcome.REJECT);
    expect(
      engine.evaluate(policy, signals({ paymentRefundable: false })).outcome,
    ).toBe(PolicyOutcome.REJECT);
    expect(engine.evaluate(policy, signals({})).outcome).toBe(
      PolicyOutcome.APPROVE,
    );
  });
});
