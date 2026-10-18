import { describe, expect, it } from "vitest";

import { PolicyValidator } from "../../src/PolicyValidator.js";
import { describePolicySignalRequirements } from "../../src/policySignalRequirements.js";
import { PolicyAction } from "../../src/types/PolicyAction.js";
import type {
  Policy,
  SignalSourceDeclaration,
} from "../../src/types/Policy.js";

/**
 * RFC-0023: signalSources declares facts Parmana establishes from a
 * business system instead of taking them from the caller. Any
 * declaration that could let a fact be skipped or supplied twice fails
 * to load.
 */

const SOURCE: SignalSourceDeclaration = {
  source: "orders-system",
  claim: "refund.eligible",
  subject: "parameters.orderId",
  maxAgeSeconds: 60,
};

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    policyId: "refund",
    policyVersion: "1.0.0",
    schemaVersion: "1.0.0",
    signalSources: { refundEligible: SOURCE },
    rules: [
      {
        id: "reject-ineligible",
        condition: { fact: "refundEligible", operator: "eq", value: false },
        outcome: { action: PolicyAction.REJECT, reason: "not eligible" },
      },
    ],
    ...overrides,
  };
}

function withSource(declaration: unknown): Policy {
  return policy({
    signalSources: { refundEligible: declaration as SignalSourceDeclaration },
  });
}

const validator = new PolicyValidator();

describe("PolicyValidator signalSources", () => {
  it("loads a policy whose fact comes from a source, counting it as covered", () => {
    expect(() => validator.validate(policy())).not.toThrow();
    expect(validator.findUncoveredFacts(policy())).toEqual([]);
  });

  it.each([
    ["a subject of target", { ...SOURCE, subject: "target" }],
    [
      "no maxAgeSeconds",
      { source: "orders-system", claim: "x", subject: "target" },
    ],
  ])("accepts %s", (_, declaration) => {
    expect(() => validator.validate(withSource(declaration))).not.toThrow();
  });

  it.each([
    ["signalSources is not an object", policy({ signalSources: [] as never })],
    ["the declaration is not an object", withSource("orders-system")],
    [
      "the source name has upper case",
      withSource({ ...SOURCE, source: "Orders" }),
    ],
    ["the source name is empty", withSource({ ...SOURCE, source: "" })],
    ["the claim is empty", withSource({ ...SOURCE, claim: " " })],
    [
      "the claim is too long",
      withSource({ ...SOURCE, claim: "x".repeat(201) }),
    ],
    [
      "the subject is a caller signal",
      withSource({ ...SOURCE, subject: "signals.orderId" }),
    ],
    ["maxAgeSeconds is zero", withSource({ ...SOURCE, maxAgeSeconds: 0 })],
    [
      "maxAgeSeconds is fractional",
      withSource({ ...SOURCE, maxAgeSeconds: 1.5 }),
    ],
    [
      "maxAgeSeconds is over a day",
      withSource({ ...SOURCE, maxAgeSeconds: 86401 }),
    ],
    [
      "no rule reads the fact",
      policy({ signalSources: { refundEligible: SOURCE, unused: SOURCE } }),
    ],
    [
      "the fact is also bound to the Intent",
      policy({ boundSignals: { refundEligible: "parameters.eligible" } }),
    ],
    [
      "the fact is also given an unbound reason",
      policy({ unboundSignalReasons: { refundEligible: "caller says so" } }),
    ],
  ])("refuses a policy where %s", (_, invalid) => {
    expect(() => validator.validate(invalid)).toThrow(
      /signalSources|contradictory/,
    );
  });

  it("refuses a fact that is both sourced and approval backed", () => {
    const invalid = policy({
      approvalSignals: { refundEligible: { resourceId: "parameters.orderId" } },
    });

    expect(() => validator.validate(invalid)).toThrow(/contradictory/);
  });
});

describe("describePolicySignalRequirements sourced", () => {
  it("tells the caller which facts the server establishes itself", () => {
    expect(describePolicySignalRequirements(policy()).sourced).toEqual({
      refundEligible: SOURCE,
    });
  });

  it("leaves the field out for a policy without sources", () => {
    const { signalSources: _, ...withoutSources } = policy();
    expect(describePolicySignalRequirements(withoutSources)).not.toHaveProperty(
      "sourced",
    );
  });
});
