import { describe, expect, it } from "vitest";

import {
  POLICY_EVALUATION_METHOD,
  PolicyEngine,
} from "../../src/PolicyEngine.js";
import type { Policy, PolicyCondition } from "../../src/types/Policy.js";
import type { PolicySignals } from "../../src/types/PolicySignals.js";

/**
 * R3 and R5, at the policy engine.
 *
 * R5: every verdict says whether its evidence was complete, insufficient (a
 * needed fact was not sent) or invalid (a fact had the wrong type). A refusal
 * on complete evidence and a refusal for missing evidence share the REJECT
 * outcome. Only the evidence field tells them apart.
 *
 * R3: every verdict names the method that produced it and that method's
 * version, set by the engine itself. Re-running that method on the same policy
 * and signals must reproduce the verdict.
 */

const engine = new PolicyEngine();

const fact = (name: string, operator: string, value?: unknown) =>
  ({ fact: name, operator, value }) as unknown as PolicyCondition;

const policy = {
  policyId: "refund",
  policyVersion: "1.0.0",
  schemaVersion: "1.0",
  signalsSchema: {
    amount: "number",
    currency: "string",
    risk_score: "number",
  },
  rules: [
    {
      id: "reject-high-risk",
      condition: fact("risk_score", "gt", 70),
      outcome: { action: "reject", reason: "high risk" },
    },
    {
      id: "approve-inr",
      condition: fact("currency", "eq", "INR"),
      outcome: { action: "approve", reason: "inr" },
    },
  ],
} as unknown as Policy;

describe("PolicyEngine evidence status (R5)", () => {
  it("reports complete evidence when every fact the decision read was sent", () => {
    const decision = engine.evaluate(policy, {
      amount: 10,
      currency: "INR",
      risk_score: 10,
    } as PolicySignals);

    expect(decision.outcome).toBe("APPROVE");
    expect(decision.evidence).toEqual({ status: "sufficient" });
  });

  it("reports insufficient evidence, naming the missing facts, for a refusal that could not be decided", () => {
    const decision = engine.evaluate(policy, { currency: "INR" });

    expect(decision.outcome).toBe("REJECT");
    expect(decision.matchedRuleId).toBe("missing-fact");
    expect(decision.evidence).toEqual({
      status: "insufficient",
      missingFacts: ["risk_score"],
    });
  });

  it("reports a refusal on complete evidence as sufficient, not insufficient", () => {
    const decision = engine.evaluate(policy, {
      amount: 10,
      currency: "INR",
      risk_score: 90,
    } as PolicySignals);

    expect(decision.outcome).toBe("REJECT");
    expect(decision.matchedRuleId).toBe("reject-high-risk");
    expect(decision.evidence).toEqual({ status: "sufficient" });
  });

  it("reports invalid evidence, naming the mistyped facts, for a wrong-typed signal", () => {
    const decision = engine.evaluate(policy, {
      amount: "10",
      currency: "INR",
      risk_score: 10,
    } as unknown as PolicySignals);

    expect(decision.outcome).toBe("REJECT");
    expect(decision.matchedRuleId).toBe("signal-type-violation");
    expect(decision.evidence).toEqual({
      status: "invalid",
      invalidFacts: ["amount"],
    });
  });

  it("lists each missing fact once and in sorted order", () => {
    const twoMissing = {
      ...policy,
      rules: [
        {
          id: "reject-either",
          condition: {
            all: [fact("risk_score", "gt", 70), fact("amount", "gt", 5)],
          },
          outcome: { action: "reject", reason: "either" },
        },
      ],
    } as unknown as Policy;

    const decision = engine.evaluate(twoMissing, {});

    expect(decision.evidence).toEqual({
      status: "insufficient",
      missingFacts: ["amount", "risk_score"],
    });
  });
});

describe("PolicyEngine evaluation method (R3)", () => {
  it("names the method and version on every kind of verdict", () => {
    const verdicts = [
      engine.evaluate(policy, {
        amount: 10,
        currency: "INR",
        risk_score: 10,
      } as PolicySignals),
      engine.evaluate(policy, { currency: "INR" }),
      engine.evaluate(policy, {
        amount: "10",
        currency: "INR",
        risk_score: 10,
      } as unknown as PolicySignals),
      engine.evaluate(policy, {
        amount: 10,
        currency: "USD",
        risk_score: 10,
      } as PolicySignals),
    ];

    for (const verdict of verdicts) {
      expect(verdict.evaluationMethod).toEqual({
        id: POLICY_EVALUATION_METHOD.id,
        version: POLICY_EVALUATION_METHOD.version,
      });
    }
  });

  it("reproduces the same verdict when the named method is re-run on the same policy and signals", () => {
    const signals = {
      amount: 10,
      currency: "INR",
      risk_score: 90,
    } as PolicySignals;

    const first = engine.evaluate(policy, signals);
    const replayed = new PolicyEngine().evaluate(policy, signals);

    expect(replayed).toEqual(first);
  });
});
