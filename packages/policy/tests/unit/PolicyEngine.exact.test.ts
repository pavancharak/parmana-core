import { describe, expect, it } from "vitest";

import { PolicyEngine } from "../../src/PolicyEngine.js";
import type { Policy, PolicyCondition } from "../../src/types/Policy.js";
import type { PolicySignals } from "../../src/types/PolicySignals.js";

/**
 * Mutation testing found the engine's own decision logic barely tested
 * in this package: an `any` condition could become `all`, a missing
 * fact could start satisfying a condition, and the no-match result
 * could change, without a test failing. These pin the engine exactly.
 */

const engine = new PolicyEngine();

const policyOf = (
  ...rules: Array<[string, PolicyCondition, "approve" | "reject"]>
): Policy =>
  ({
    policyId: "test",
    policyVersion: "1.0.0",
    rules: rules.map(([id, condition, action]) => ({
      id,
      condition,
      outcome: { action, reason: `reason-${id}` },
    })),
  }) as unknown as Policy;

const decide = (condition: PolicyCondition, signals: PolicySignals) =>
  engine.evaluate(policyOf(["only", condition, "approve"]), signals).outcome;

const fact = (name: string, operator: string, value?: unknown) =>
  ({ fact: name, operator, value }) as unknown as PolicyCondition;

describe("PolicyEngine, exactly", () => {
  it("with no matching rule, refuses and says so", () => {
    const decision = engine.evaluate(
      policyOf(["r1", fact("amount", "gt", 100), "approve"]),
      { amount: 50 },
    );
    expect(decision).toMatchObject({
      outcome: "REJECT",
      reason: "no_rule_matched",
      matchedRuleId: "none",
      evaluatedRules: 1,
      matchedPath: ["r1"],
    });
  });

  it("first match wins, and the trace lists every rule tried up to it", () => {
    const decision = engine.evaluate(
      policyOf(
        ["reject-large", fact("amount", "gt", 1000), "reject"],
        ["approve-small", fact("amount", "lte", 1000), "approve"],
        ["approve-any", { always: true } as PolicyCondition, "approve"],
      ),
      { amount: 500 },
    );
    expect(decision).toMatchObject({
      outcome: "APPROVE",
      reason: "reason-approve-small",
      matchedRuleId: "approve-small",
      evaluatedRules: 2,
      matchedPath: ["reject-large", "approve-small"],
    });
  });

  it("an unknown outcome action refuses", () => {
    const policy = policyOf([
      "r1",
      { always: true } as PolicyCondition,
      "approve",
    ]);
    (policy.rules[0]!.outcome as { action: string }).action = "escalate";
    expect(engine.evaluate(policy, {}).outcome).toBe("REJECT");
  });

  describe("a missing fact never satisfies a condition", () => {
    it.each([
      ["not_exists", undefined],
      ["neq", "x"],
      ["not_in", ["x"]],
      ["is_not_null", undefined],
    ])(
      "not even %s, which a present value could satisfy",
      (operator, value) => {
        expect(decide(fact("absent", operator, value), {})).toBe("REJECT");
      },
    );
  });

  describe("any and all", () => {
    const big = fact("amount", "gt", 100);
    const flagged = fact("flagged", "is_true");

    it("any matches when at least one child matches", () => {
      expect(
        decide({ any: [big, flagged] } as PolicyCondition, {
          amount: 500,
          flagged: false,
        }),
      ).toBe("APPROVE");
      expect(
        decide({ any: [big, flagged] } as PolicyCondition, {
          amount: 5,
          flagged: true,
        }),
      ).toBe("APPROVE");
      expect(
        decide({ any: [big, flagged] } as PolicyCondition, {
          amount: 5,
          flagged: false,
        }),
      ).toBe("REJECT");
    });

    it("all matches only when every child matches", () => {
      expect(
        decide({ all: [big, flagged] } as PolicyCondition, {
          amount: 500,
          flagged: true,
        }),
      ).toBe("APPROVE");
      expect(
        decide({ all: [big, flagged] } as PolicyCondition, {
          amount: 500,
          flagged: false,
        }),
      ).toBe("REJECT");
      expect(
        decide({ all: [big, flagged] } as PolicyCondition, {
          amount: 5,
          flagged: true,
        }),
      ).toBe("REJECT");
    });

    it("an empty any never matches; an empty all always does", () => {
      expect(decide({ any: [] } as unknown as PolicyCondition, {})).toBe(
        "REJECT",
      );
      expect(decide({ all: [] } as unknown as PolicyCondition, {})).toBe(
        "APPROVE",
      );
    });

    it("nests", () => {
      const condition = {
        all: [big, { any: [flagged, fact("vip", "is_true")] }],
      } as PolicyCondition;
      expect(
        decide(condition, { amount: 500, flagged: false, vip: true }),
      ).toBe("APPROVE");
      expect(
        decide(condition, { amount: 500, flagged: false, vip: false }),
      ).toBe("REJECT");
    });

    it("a condition of no known kind never matches", () => {
      expect(decide({ unknown: true } as unknown as PolicyCondition, {})).toBe(
        "REJECT",
      );
    });
  });
});
