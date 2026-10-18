import { describe, expect, it } from "vitest";

import { PolicyValidator } from "../../src/PolicyValidator.js";
import type { Policy } from "../../src/types/Policy.js";

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    policyId: "p",
    policyVersion: "1.0.0",
    schemaVersion: "1.0.0",
    boundSignals: { amount: "parameters.amount" },
    unboundSignalReasons: { eligible: "Checked elsewhere." },
    approvalSignals: {
      managerApproved: {
        resourceId: "parameters.orderId",
        value: "parameters.amount",
      },
    },
    rules: [
      {
        id: "approve",
        condition: {
          all: [
            { fact: "eligible", operator: "is_true" },
            { fact: "managerApproved", operator: "is_true" },
            { fact: "amount", operator: "lte", value: 100 },
          ],
        },
        outcome: { action: "approve", reason: "Approved." },
      },
      {
        id: "reject",
        condition: { always: true },
        outcome: { action: "reject", reason: "Rejected." },
      },
    ],
    ...overrides,
  } as Policy;
}

describe("PolicyValidator approvalSignals", () => {
  const validator = new PolicyValidator();

  it("accepts a valid declaration, and counts its key as covered", () => {
    expect(() => validator.validate(policy())).not.toThrow();
    expect(validator.findUncoveredFacts(policy())).toEqual([]);
  });

  it('accepts "target" as the resource', () => {
    expect(() =>
      validator.validate(
        policy({
          approvalSignals: { managerApproved: { resourceId: "target" } },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects "target" as a value, which must be a number in the parameters', () => {
    expect(() =>
      validator.validate(
        policy({
          approvalSignals: {
            managerApproved: { resourceId: "target", value: "target" },
          },
        }),
      ),
    ).toThrow("value must be a dot-path");
  });

  it("accepts a declaration with no value and a named artifact", () => {
    expect(() =>
      validator.validate(
        policy({
          approvalSignals: {
            managerApproved: {
              resourceId: "parameters.pullNumber",
              artifact: "managerApproval",
            },
          },
        }),
      ),
    ).not.toThrow();
  });

  it.each([
    [
      "a key no rule reads",
      {
        managerApproved: { resourceId: "parameters.orderId" },
        unusedApproved: { resourceId: "parameters.orderId", artifact: "x" },
      },
      "no rule references",
    ],
    [
      "a resource path outside the parameters",
      { managerApproved: { resourceId: "signals.orderId" } },
      "resourceId must be",
    ],
    [
      "an empty resource path",
      { managerApproved: { resourceId: "parameters." } },
      "resourceId must be",
    ],
    [
      "a value path outside the parameters",
      {
        managerApproved: {
          resourceId: "parameters.orderId",
          value: "signals.amount",
        },
      },
      "value must be a dot-path",
    ],
    [
      "an artifact name with other characters",
      {
        managerApproved: {
          resourceId: "parameters.orderId",
          artifact: "approval.artifact",
        },
      },
      "artifact must be a signal name",
    ],
    [
      "a declaration that is not an object",
      { managerApproved: "parameters.orderId" },
      "must be an object",
    ],
  ])("rejects %s", (_name, approvalSignals, message) => {
    expect(() =>
      validator.validate(
        policy({ approvalSignals } as unknown as Partial<Policy>),
      ),
    ).toThrow(message);
  });

  it("rejects a key that is also bound to the Intent", () => {
    expect(() =>
      validator.validate(
        policy({
          boundSignals: {
            amount: "parameters.amount",
            managerApproved: "parameters.approved",
          },
        }),
      ),
    ).toThrow("already has a boundSignals entry");
  });

  it("rejects two approval signals sharing one artifact", () => {
    const base = policy();
    const rules = structuredClone(base.rules);
    (rules[0].condition as { all: unknown[] }).all.push({
      fact: "financeApproved",
      operator: "is_true",
    });

    expect(() =>
      validator.validate({
        ...base,
        rules,
        approvalSignals: {
          managerApproved: { resourceId: "parameters.orderId" },
          financeApproved: { resourceId: "parameters.orderId" },
        },
      }),
    ).toThrow("is used by another approval signal");
  });

  it("rejects an artifact signal that a rule reads", () => {
    expect(() =>
      validator.validate(
        policy({
          approvalSignals: {
            managerApproved: {
              resourceId: "parameters.orderId",
              artifact: "eligible",
            },
          },
        }),
      ),
    ).toThrow("is read by a rule");
  });

  it("still requires coverage for other facts", () => {
    expect(() =>
      validator.validate(policy({ unboundSignalReasons: {} })),
    ).toThrow("'eligible'");
  });
});
