import { describe, expect, it } from "vitest";

import { PolicyEngine } from "../../src/PolicyEngine.js";

import type { Policy, PolicyInput } from "../../src/types/Policy.js";

describe("PolicyEngine", () => {
  it("should evaluate policy", () => {
    const engine = new PolicyEngine();

    const policy: Policy = {
      policyId: "test",

      rules: [
        {
          id: "r1",

          condition: {
            all: [],
          },

          outcome: {
            action: "approve",
            requiresOverride: false,
            reason: "ok",
          },
        },
      ],
    };

    const input: PolicyInput = {
      amount: 100,
      currency: "INR",
      recipient: "abc",
    };

    const result = engine.evaluate(policy, input);

    expect(result.outcome).toBe("APPROVE");
  });
});
