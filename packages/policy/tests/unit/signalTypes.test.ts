import { describe, expect, it } from "vitest";

import { PolicyEngine } from "../../src/PolicyEngine.js";
import { PolicyValidator } from "../../src/PolicyValidator.js";
import { findSignalTypeViolations } from "../../src/signalTypes.js";
import type { Policy } from "../../src/types/Policy.js";
import type { PolicySignals } from "../../src/types/PolicySignals.js";

/**
 * A request whose signals do not have the types the policy declares is
 * refused before any rule runs. Otherwise a number sent as text makes
 * every numeric condition false, and a rule written as "reject if amount
 * gt X, otherwise approve" would approve it.
 */

const engine = new PolicyEngine();

const refundPolicy = {
  policyId: "refund",
  policyVersion: "1.0.0",
  schemaVersion: "1.0",
  signalsSchema: {
    refundAmount: "number",
    customerVerified: "boolean",
    region: "string",
  },
  rules: [
    {
      id: "reject-large",
      condition: { fact: "refundAmount", operator: "gt", value: 1000 },
      outcome: { action: "reject", reason: "too large" },
    },
    {
      id: "approve-rest",
      condition: { always: true },
      outcome: { action: "approve", reason: "ok" },
    },
  ],
} as unknown as Policy;

const decide = (signals: Record<string, unknown>) =>
  engine.evaluate(refundPolicy, signals as PolicySignals);

describe("signal types are enforced before rules run", () => {
  it("a number sent as text is refused, where the rules alone would approve it", () => {
    const decision = decide({ refundAmount: "150000" });
    expect(decision).toMatchObject({
      outcome: "REJECT",
      matchedRuleId: "signal-type-violation",
      evaluatedRules: 0,
      matchedPath: [],
    });
    expect(decision.reason).toBe(
      "Rejected: signal(s) do not have the type the policy declares (refundAmount must be number, got string).",
    );
  });

  it.each([
    ["a boolean sent as text", { customerVerified: "true" }],
    ["a boolean sent as a number", { customerVerified: 1 }],
    ["a string sent as a number", { region: 44 }],
    ["null", { refundAmount: null }],
    ["an array", { refundAmount: [100] }],
    ["an object", { region: { name: "eu" } }],
    ["NaN", { refundAmount: Number.NaN }],
    ["Infinity", { refundAmount: Number.POSITIVE_INFINITY }],
  ])("%s is refused", (_label, signals) => {
    expect(decide(signals).matchedRuleId).toBe("signal-type-violation");
  });

  it("names null and arrays as such", () => {
    expect(decide({ refundAmount: null }).reason).toBe(
      "Rejected: signal(s) do not have the type the policy declares (refundAmount must be number, got null).",
    );
    expect(decide({ region: ["eu"] }).reason).toBe(
      "Rejected: signal(s) do not have the type the policy declares (region must be string, got array).",
    );
  });

  it("names every mismatching signal", () => {
    expect(
      decide({ refundAmount: "5", customerVerified: "yes", region: "eu" })
        .reason,
    ).toBe(
      "Rejected: signal(s) do not have the type the policy declares (refundAmount must be number, got string, customerVerified must be boolean, got string).",
    );
  });

  it("correctly typed signals reach the rules", () => {
    expect(decide({ refundAmount: 150000 })).toMatchObject({
      outcome: "REJECT",
      matchedRuleId: "reject-large",
    });
    expect(
      decide({ refundAmount: 50, customerVerified: false, region: "eu" }),
    ).toMatchObject({ outcome: "APPROVE", matchedRuleId: "approve-rest" });
  });

  it("an absent signal is not a type violation: the rules decide", () => {
    expect(decide({}).matchedRuleId).toBe("approve-rest");
    expect(decide({ refundAmount: undefined }).matchedRuleId).toBe(
      "approve-rest",
    );
  });

  it("a signal the schema does not declare is not checked", () => {
    expect(decide({ note: 12, refundAmount: 5 }).matchedRuleId).toBe(
      "approve-rest",
    );
  });

  it("a policy without signalsSchema is evaluated as before", () => {
    const { signalsSchema: _ignored, ...rest } = refundPolicy as unknown as {
      signalsSchema: unknown;
    } & Record<string, unknown>;
    const decision = engine.evaluate(
      rest as unknown as Policy,
      { refundAmount: "150000" } as unknown as PolicySignals,
    );
    expect(decision.matchedRuleId).toBe("approve-rest");
  });

  it("an inherited property is not read as a signal", () => {
    const signals = Object.create({ refundAmount: "1" }) as PolicySignals;
    expect(findSignalTypeViolations(refundPolicy, signals)).toEqual([]);
  });
});

describe("PolicyValidator checks signalsSchema", () => {
  const validator = new PolicyValidator();
  const withSchema = (signalsSchema: unknown) =>
    ({
      policyId: "p",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      signalsSchema,
      rules: [
        {
          id: "reject",
          condition: { always: true },
          outcome: { action: "reject", reason: "Rejected." },
        },
      ],
    }) as unknown as Policy;

  it("accepts boolean, number and string", () => {
    expect(() =>
      validator.validate(withSchema(refundPolicy.signalsSchema)),
    ).not.toThrow();
  });
  it.each([
    [
      "an unknown type",
      { amount: "integer" },
      'signalsSchema.amount must be one of boolean, number, string; got "integer".',
    ],
    [
      "a non-string type",
      { amount: 1 },
      "signalsSchema.amount must be one of boolean, number, string; got 1.",
    ],
    ["an array", ["number"], "signalsSchema must be an object."],
    ["null", null, "signalsSchema must be an object."],
  ])("refuses %s", (_label, schema, message) => {
    expect(() => validator.validate(withSchema(schema))).toThrow(message);
  });
});
