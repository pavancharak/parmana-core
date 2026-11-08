import { describe, expect, it } from "vitest";

import { PolicyEngine } from "../../src/PolicyEngine.js";
import type { Policy, PolicyCondition } from "../../src/types/Policy.js";

/**
 * A request must send every fact the policy reads. Before this check, a
 * missing fact only made its own condition false, so a reject rule that
 * read it was skipped and a later approve rule could still match (PC-004).
 */

const engine = new PolicyEngine();

const fact = (name: string, operator: string, value?: unknown) =>
  ({ fact: name, operator, value }) as unknown as PolicyCondition;

const policyOf = (
  ...rules: Array<[string, PolicyCondition, "approve" | "reject"]>
): Policy =>
  ({
    policyId: "refund",
    policyVersion: "1.0.0",
    rules: rules.map(([id, condition, action]) => ({
      id,
      condition,
      outcome: { action, reason: `reason-${id}` },
    })),
  }) as unknown as Policy;

// The PC-004 shape: a reject rule on risk_score, then an approve rule on currency.
const riskThenCurrency = policyOf(
  ["reject-high-risk", fact("risk_score", "gt", 70), "reject"],
  ["approve-inr", fact("currency", "eq", "INR"), "approve"],
);

describe("PolicyEngine refuses a request that omits a fact the policy reads", () => {
  it("refuses an INR request with no risk_score instead of approving it (PC-004)", () => {
    const decision = engine.evaluate(riskThenCurrency, { currency: "INR" });

    expect(decision.outcome).toBe("REJECT");
    expect(decision.matchedRuleId).toBe("missing-fact");
    expect(decision.reason).toContain("risk_score");
    expect(decision.evaluatedRules).toBe(1);
    expect(decision.matchedPath).toEqual(["reject-high-risk"]);
  });

  it("still rejects a high risk score (control)", () => {
    const decision = engine.evaluate(riskThenCurrency, {
      currency: "INR",
      risk_score: 90,
    });

    expect(decision.outcome).toBe("REJECT");
    expect(decision.matchedRuleId).toBe("reject-high-risk");
  });

  it("still approves when every fact is sent (control)", () => {
    const decision = engine.evaluate(riskThenCurrency, {
      currency: "INR",
      risk_score: 10,
    });

    expect(decision.outcome).toBe("APPROVE");
    expect(decision.matchedRuleId).toBe("approve-inr");
  });

  const eitherApproval = policyOf([
    "approve-either",
    {
      any: [
        fact("approved_by_manager", "is_true"),
        fact("approved_by_cfo", "is_true"),
      ],
    } as unknown as PolicyCondition,
    "approve",
  ]);

  it("an OR that a sent branch already makes true still decides", () => {
    const decision = engine.evaluate(eitherApproval, {
      approved_by_manager: true,
    });

    expect(decision.outcome).toBe("APPROVE");
    expect(decision.matchedRuleId).toBe("approve-either");
  });

  it("an OR whose sent branches are false and whose other branch is missing is refused", () => {
    const decision = engine.evaluate(eitherApproval, {
      approved_by_manager: false,
    });

    expect(decision.outcome).toBe("REJECT");
    expect(decision.matchedRuleId).toBe("missing-fact");
    expect(decision.reason).toContain("approved_by_cfo");
  });

  it("does not refuse for a fact that only a rule the decision never reaches reads", () => {
    const policy = policyOf(
      ["approve-inr", fact("currency", "eq", "INR"), "approve"],
      ["reject-high-risk", fact("risk_score", "gt", 70), "reject"],
    );

    const decision = engine.evaluate(policy, { currency: "INR" });

    expect(decision.outcome).toBe("APPROVE");
    expect(decision.matchedRuleId).toBe("approve-inr");
  });

  it("a rule that is false because of a sent fact does not block a later missing-fact refusal", () => {
    const policy = policyOf(
      ["skip-usd", fact("currency", "eq", "USD"), "approve"],
      ["reject-high-risk", fact("risk_score", "gt", 70), "reject"],
    );

    const decision = engine.evaluate(policy, { currency: "INR" });

    expect(decision.outcome).toBe("REJECT");
    expect(decision.matchedRuleId).toBe("missing-fact");
    expect(decision.reason).toContain("risk_score");
  });

  it("names every missing fact, sorted", () => {
    const policy = policyOf([
      "approve-all",
      {
        all: [fact("zeta", "is_true"), fact("alpha", "is_true")],
      } as unknown as PolicyCondition,
      "approve",
    ]);

    const decision = engine.evaluate(policy, {});

    expect(decision.reason).toContain("alpha, zeta");
  });

  it("evaluates normally for a policy that reads no facts", () => {
    const policy = policyOf([
      "always-approve",
      { always: true } as unknown as PolicyCondition,
      "approve",
    ]);

    expect(engine.evaluate(policy, {}).outcome).toBe("APPROVE");
  });
});
