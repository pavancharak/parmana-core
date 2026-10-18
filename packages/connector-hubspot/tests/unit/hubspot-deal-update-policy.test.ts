import { readFileSync } from "node:fs";
import path from "node:path";

import {
  PolicyEngine,
  PolicyOutcome,
  PolicyValidator,
  type Policy,
  type PolicySignals,
} from "@parmana/policy";
import { describe, expect, it } from "vitest";

const policy = JSON.parse(
  readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../../../policies/hubspot-deal-update/1.1.0/policy.json",
    ),
    "utf8",
  ),
) as Policy;

function baseSignals(overrides: Partial<PolicySignals> = {}): PolicySignals {
  return {
    dealUpdateApproved: true,
    currentDealStage: "appointmentscheduled",
    proposedDealStage: "qualifiedtobuy",
    dealStageChangeRequested: true,
    dealStageTransitionAllowed: true,
    amountChangeRequested: false,
    amountDeltaAbs: 0,
    amountChangeExceedsThreshold: false,
    ...overrides,
  };
}

describe("hubspot-deal-update 1.1.0 policy", () => {
  const validator = new PolicyValidator();
  const engine = new PolicyEngine();

  it("validates against the locked policy schema", () => {
    expect(() => validator.validate(policy)).not.toThrow();
  });

  it("approves a dealstage-only update on an allowed forward transition", () => {
    const decision = engine.evaluate(policy, baseSignals());
    expect(decision.outcome).toBe(PolicyOutcome.APPROVE);
    expect(decision.matchedRuleId).toBe("approve-deal-update-with-approval");
  });

  it("approves an amount-only update within threshold", () => {
    const decision = engine.evaluate(
      policy,
      baseSignals({
        proposedDealStage: "appointmentscheduled",
        dealStageChangeRequested: false,
        amountChangeRequested: true,
        amountDeltaAbs: 500,
        amountChangeExceedsThreshold: false,
      }),
    );
    expect(decision.outcome).toBe(PolicyOutcome.APPROVE);
    expect(decision.matchedRuleId).toBe("approve-deal-update-with-approval");
  });

  it("approves a combined dealstage + amount update when both conditions are satisfied", () => {
    const decision = engine.evaluate(
      policy,
      baseSignals({
        amountChangeRequested: true,
        amountDeltaAbs: 2000,
        amountChangeExceedsThreshold: false,
      }),
    );
    expect(decision.outcome).toBe(PolicyOutcome.APPROVE);
  });

  it("denies a dealstage transition that is not on an allowed forward path", () => {
    const decision = engine.evaluate(
      policy,
      baseSignals({ dealStageTransitionAllowed: false }),
    );
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
    expect(decision.matchedRuleId).toBe("reject-stage-transition-not-allowed");
    expect(decision.reason).toMatch(/not on an allowed forward path/);
  });

  it("denies any update without a signed approval for the deal", () => {
    const decision = engine.evaluate(
      policy,
      baseSignals({ dealUpdateApproved: false }),
    );
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
    expect(decision.matchedRuleId).toBe("reject-approval-required");
  });

  it("approves an amount change exceeding the threshold only with the signed approval", () => {
    const signals = baseSignals({
      proposedDealStage: "appointmentscheduled",
      dealStageChangeRequested: false,
      amountChangeRequested: true,
      amountDeltaAbs: 50_000,
      amountChangeExceedsThreshold: true,
    });

    expect(engine.evaluate(policy, signals).outcome).toBe(
      PolicyOutcome.APPROVE,
    );
    expect(
      engine.evaluate(policy, { ...signals, dealUpdateApproved: false })
        .outcome,
    ).toBe(PolicyOutcome.REJECT);
  });

  it("denies a disallowed stage transition even when an accompanying amount change is fine, at the stage rule (evaluated first)", () => {
    const decision = engine.evaluate(
      policy,
      baseSignals({
        dealStageTransitionAllowed: false,
        amountChangeRequested: true,
        amountDeltaAbs: 100,
        amountChangeExceedsThreshold: false,
      }),
    );
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
    expect(decision.matchedRuleId).toBe("reject-stage-transition-not-allowed");
  });
});
