import { describe, expect, it } from "vitest";

import { PolicyValidator } from "../../src/PolicyValidator.js";
import type { Policy, PolicyCondition } from "../../src/types/Policy.js";

/**
 * Gap #1 (boundSignals coverage): PolicyValidator validates boundSignals
 * shape and rule-condition shape independently, but never related them
 * -- a rule could approve on a fact with no boundSignals entry, silently
 * forfeiting SignalIntentBinder's protection for that fact. This started
 * as an additive, warn-only cross-check; G-32 [policy-authoring audit,
 * 2026-09-09] made it fail-closed via validate() (see the second describe
 * block below) once unboundSignalReasons gave policy authors a way to
 * explicitly acknowledge a genuinely unbindable fact instead of silently
 * leaving it unmentioned.
 */
describe("PolicyValidator.findUncoveredFacts", () => {
  const validator = new PolicyValidator();

  const basePolicy: Policy = {
    policyId: "test-policy",
    policyVersion: "1.0.0",
    schemaVersion: "1.0.0",
    rules: [
      {
        id: "approve",
        condition: { always: true },
        outcome: { action: "approve" as never, reason: "always approves" },
      },
    ],
  };

  it("returns no uncovered facts when every rule fact is bound", () => {
    const policy: Policy = {
      ...basePolicy,
      boundSignals: { amount: "parameters.amount" },
      rules: [
        {
          id: "reject-large",
          condition: { fact: "amount", operator: "gt", value: 500 },
          outcome: { action: "reject" as never, reason: "too large" },
        },
      ],
    };

    expect(validator.findUncoveredFacts(policy)).toEqual([]);
  });

  it("returns no uncovered facts when a policy uses no rule facts at all", () => {
    expect(validator.findUncoveredFacts(basePolicy)).toEqual([]);
  });

  it("reports a fact used in a rule but absent from boundSignals", () => {
    const policy: Policy = {
      ...basePolicy,
      boundSignals: undefined,
      rules: [
        {
          id: "reject-large",
          condition: { fact: "amount", operator: "gt", value: 500 },
          outcome: { action: "reject" as never, reason: "too large" },
        },
      ],
    };

    expect(validator.findUncoveredFacts(policy)).toEqual(["amount"]);
  });

  it("reports each uncovered fact across nested all/any conditions, leaving bound facts out", () => {
    const policy: Policy = {
      ...basePolicy,
      boundSignals: { amount: "parameters.amount" },
      rules: [
        {
          id: "reject-risky",
          condition: {
            all: [
              { fact: "amount", operator: "gt", value: 500 },
              {
                any: [
                  { fact: "vendorVerified", operator: "is_false", value: true },
                  { fact: "riskScore", operator: "gt", value: 80 },
                ],
              },
            ],
          },
          outcome: { action: "reject" as never, reason: "risky" },
        },
      ],
    };

    expect(validator.findUncoveredFacts(policy).sort()).toEqual(
      ["riskScore", "vendorVerified"].sort(),
    );
  });

  it("excludes a fact acknowledged in unboundSignalReasons", () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          id: "reject-unverified",
          condition: {
            fact: "vendorVerified",
            operator: "is_false",
            value: true,
          },
          outcome: { action: "reject" as never, reason: "unverified" },
        },
      ],
      unboundSignalReasons: {
        vendorVerified: "No genuine Intent-side equivalent.",
      },
    };

    expect(validator.findUncoveredFacts(policy)).toEqual([]);
  });
});

describe("PolicyValidator.validate -- unboundSignalReasons", () => {
  const validator = new PolicyValidator();

  const basePolicy: Policy = {
    policyId: "test-policy",
    policyVersion: "1.0.0",
    schemaVersion: "1.0.0",
    rules: [
      {
        id: "reject-unverified",
        condition: {
          fact: "vendorVerified",
          operator: "is_false",
          value: true,
        },
        outcome: { action: "reject" as never, reason: "unverified" },
      },
    ],
  };

  it("passes when the only uncovered fact is acknowledged with a reason", () => {
    expect(() =>
      validator.validate({
        ...basePolicy,
        unboundSignalReasons: {
          vendorVerified: "No genuine Intent-side equivalent.",
        },
      }),
    ).not.toThrow();
  });

  it("fails closed -- throws naming the fact -- when a rule-referenced fact is neither bound nor acknowledged", () => {
    expect(() => validator.validate(basePolicy)).toThrow(/'vendorVerified'/);
  });

  it("passes when the only uncovered fact is instead bound via boundSignals", () => {
    expect(() =>
      validator.validate({
        ...basePolicy,
        rules: [
          {
            id: "reject-large",
            condition: { fact: "amount", operator: "gt", value: 500 },
            outcome: { action: "reject" as never, reason: "too large" },
          },
        ],
        boundSignals: { amount: "parameters.amount" },
      }),
    ).not.toThrow();
  });

  it("rejects a non-object unboundSignalReasons", () => {
    expect(() =>
      validator.validate({
        ...basePolicy,
        unboundSignalReasons: "vendorVerified" as never,
      }),
    ).toThrow(/unboundSignalReasons must be an object/);
  });

  it("rejects an empty reason string", () => {
    expect(() =>
      validator.validate({
        ...basePolicy,
        unboundSignalReasons: { vendorVerified: "   " },
      }),
    ).toThrow(/must be a non-empty reason string/);
  });

  it("rejects a fact acknowledged in unboundSignalReasons that is also bound in boundSignals, as contradictory", () => {
    expect(() =>
      validator.validate({
        ...basePolicy,
        rules: [
          {
            id: "reject-large",
            condition: { fact: "amount", operator: "gt", value: 500 },
            outcome: { action: "reject" as never, reason: "too large" },
          },
        ],
        boundSignals: { amount: "parameters.amount" },
        unboundSignalReasons: { amount: "contradiction" },
      }),
    ).toThrow(/contradictory/);
  });
});

/**
 * Audit finding (2026-09-09, policy approval/rejection audit): overlapping
 * rule conditions fail silently under first-match-wins -- two rules could
 * both match a given input with no signal that the earlier one always
 * wins. findRuleConflicts() is advisory only (see its own doc comment for
 * why it is never wired into validate()'s fail-closed throw): a heuristic
 * judgment call, not a structural guarantee like boundSignals coverage.
 *
 * Every real policy in policies/ was checked against this method directly
 * (a scratch script, not committed) once implemented: zero WARNING-level
 * results across all 10 -- the one case (hubspot-deal-update) that gets an
 * INFO-level "needs review" result is a genuine, deliberate first-match-wins
 * priority ordering between two independent violation reasons that really
 * can co-occur, not a bug.
 */
describe("PolicyValidator.findRuleConflicts", () => {
  const validator = new PolicyValidator();

  const basePolicy: Policy = {
    policyId: "test-policy",
    policyVersion: "1.0.0",
    schemaVersion: "1.0.0",
    rules: [],
  };

  it("returns nothing for a policy with a single rule", () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          id: "reject-default",
          condition: { always: true },
          outcome: {
            action: "reject" as never,
            reason: "no other rule matched",
          },
        },
      ],
    };
    expect(validator.findRuleConflicts(policy)).toEqual([]);
  });

  it("does not flag the idiomatic trailing 'always: true' catch-all", () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          id: "reject-blocked",
          condition: { fact: "merchant", operator: "eq", value: "BLOCKED" },
          outcome: { action: "reject" as never, reason: "blocked merchant" },
        },
        {
          id: "reject-default",
          condition: { always: true },
          outcome: {
            action: "reject" as never,
            reason: "no other rule matched",
          },
        },
      ],
    };
    expect(validator.findRuleConflicts(policy)).toEqual([]);
  });

  it("flags an 'always: true' rule that is NOT last as a hard WARNING (everything after it is unreachable)", () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          id: "catch-all-too-early",
          condition: { always: true },
          outcome: { action: "reject" as never, reason: "..." },
        },
        {
          id: "unreachable-rule",
          condition: { fact: "merchant", operator: "eq", value: "BLOCKED" },
          outcome: { action: "reject" as never, reason: "..." },
        },
      ],
    };
    const conflicts = validator.findRuleConflicts(policy);
    expect(conflicts).toContainEqual(
      expect.objectContaining({
        level: "WARNING",
        ruleId: "catch-all-too-early",
        conflictingRuleId: "unreachable-rule",
      }),
    );
  });

  it("does not flag conditions on different facts", () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          id: "rule1",
          condition: { fact: "riskScore", operator: "lte", value: 20 },
          outcome: { action: "approve" as never, reason: "..." },
        },
        {
          id: "rule2",
          condition: { fact: "vendorVerified", operator: "eq", value: false },
          outcome: { action: "reject" as never, reason: "..." },
        },
      ],
    };
    expect(validator.findRuleConflicts(policy)).toEqual([]);
  });

  it("does not flag mutually exclusive conditions at the exact same threshold (lte 20 vs gt 20)", () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          id: "approve",
          condition: { fact: "riskScore", operator: "lte", value: 20 },
          outcome: { action: "approve" as never, reason: "..." },
        },
        {
          id: "reject-high-risk",
          condition: { fact: "riskScore", operator: "gt", value: 20 },
          outcome: { action: "reject" as never, reason: "..." },
        },
      ],
    };
    expect(validator.findRuleConflicts(policy)).toEqual([]);
  });

  it("does not flag disjoint ranges at DIFFERENT thresholds (lte 10 vs gt 20) -- the naive 'check only equal thresholds' heuristic gets this wrong", () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          id: "rule1",
          condition: { fact: "riskScore", operator: "lte", value: 10 },
          outcome: { action: "approve" as never, reason: "..." },
        },
        {
          id: "rule2",
          condition: { fact: "riskScore", operator: "gt", value: 20 },
          outcome: { action: "reject" as never, reason: "..." },
        },
      ],
    };
    expect(validator.findRuleConflicts(policy)).toEqual([]);
  });

  it("flags genuinely overlapping ranges pointing the same direction (lte 30 and lte 50 both true for, say, riskScore=10)", () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          id: "rule1",
          condition: { fact: "riskScore", operator: "lte", value: 30 },
          outcome: { action: "approve" as never, reason: "..." },
        },
        {
          id: "rule2",
          condition: { fact: "riskScore", operator: "lte", value: 50 },
          outcome: { action: "reject" as never, reason: "..." },
        },
      ],
    };
    const conflicts = validator.findRuleConflicts(policy);
    expect(conflicts).toContainEqual(
      expect.objectContaining({
        level: "WARNING",
        ruleId: "rule1",
        conflictingRuleId: "rule2",
      }),
    );
  });

  it("resolves a nested 'all' against a leaf on the same fact to NO_OVERLAP when one conjunct is disjoint -- the real shape every policy in this repo uses (approve requires riskScore<=20 among other ANDed facts; a separate reject-high-risk rule requires riskScore>20)", () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          id: "approve-payment",
          condition: {
            all: [
              { fact: "vendorVerified", operator: "eq", value: true },
              { fact: "riskScore", operator: "lte", value: 20 },
            ],
          },
          outcome: { action: "approve" as never, reason: "..." },
        },
        {
          id: "reject-high-risk",
          condition: { fact: "riskScore", operator: "gt", value: 20 },
          outcome: { action: "reject" as never, reason: "..." },
        },
      ],
    };
    expect(validator.findRuleConflicts(policy)).toEqual([]);
  });

  it("resolves two nested 'all' conditions to NO_OVERLAP when any cross-pair of conjuncts is disjoint", () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          id: "allow-refund-within-threshold",
          condition: {
            all: [
              { fact: "capability", operator: "eq", value: "payments:refund" },
              { fact: "paymentAmount", operator: "lte", value: 5000 },
            ],
          },
          outcome: { action: "approve" as never, reason: "..." },
        },
        {
          id: "block-refund-above-threshold",
          condition: {
            all: [
              { fact: "capability", operator: "eq", value: "payments:refund" },
              { fact: "paymentAmount", operator: "gt", value: 5000 },
            ],
          },
          outcome: { action: "reject" as never, reason: "..." },
        },
      ],
    };
    expect(validator.findRuleConflicts(policy)).toEqual([]);
  });

  it("reports NEEDS_REVIEW (INFO), not a guessed answer, for facts that are genuinely independent and could plausibly co-occur", () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          id: "reject-stage-not-allowed",
          condition: {
            all: [
              { fact: "dealStageChangeRequested", operator: "eq", value: true },
              {
                fact: "dealStageTransitionAllowed",
                operator: "eq",
                value: false,
              },
            ],
          },
          outcome: { action: "reject" as never, reason: "..." },
        },
        {
          id: "reject-amount-exceeds-threshold",
          condition: {
            all: [
              {
                fact: "amountChangeExceedsThreshold",
                operator: "eq",
                value: true,
              },
              {
                fact: "preAuthorizedForAmountChange",
                operator: "eq",
                value: false,
              },
            ],
          },
          outcome: { action: "reject" as never, reason: "..." },
        },
      ],
    };
    const conflicts = validator.findRuleConflicts(policy);
    expect(conflicts).toContainEqual(
      expect.objectContaining({
        level: "INFO",
        ruleId: "reject-stage-not-allowed",
        conflictingRuleId: "reject-amount-exceeds-threshold",
      }),
    );
  });

  it("is not wired into validate() -- a policy with a genuine conflict still loads without throwing", () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          id: "rule1",
          condition: {
            all: [
              { fact: "humanApproved", operator: "is_true" },
              { fact: "riskScore", operator: "lte", value: 30 },
            ],
          },
          outcome: { action: "approve" as never, reason: "..." },
        },
        {
          id: "rule2",
          condition: { fact: "riskScore", operator: "lte", value: 50 },
          outcome: { action: "reject" as never, reason: "..." },
        },
      ],
      approvalSignals: { humanApproved: { resourceId: "target" } },
      unboundSignalReasons: { riskScore: "test fixture" },
    };
    expect(() => validator.validate(policy)).not.toThrow();
    expect(validator.findRuleConflicts(policy).length).toBeGreaterThan(0);
  });
});

describe("PolicyValidator: no approval without a signed human approval", () => {
  const validator = new PolicyValidator();

  const approval = { humanApproved: { resourceId: "target" } };

  function policyWith(
    condition: PolicyCondition,
    approvalSignals: Policy["approvalSignals"] | null = approval,
  ): Policy {
    return {
      policyId: "test-policy",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      ...(approvalSignals !== null ? { approvalSignals } : {}),
      unboundSignalReasons: { riskScore: "test fixture" },
      rules: [
        {
          id: "approve",
          condition,
          outcome: { action: "approve" as never, reason: "approves" },
        },
        {
          id: "reject-not-approved",
          condition: { fact: "humanApproved", operator: "is_false" },
          outcome: { action: "reject" as never, reason: "not approved" },
        },
        {
          id: "reject-default",
          condition: { always: true },
          outcome: { action: "reject" as never, reason: "rejects" },
        },
      ],
    };
  }

  it("accepts an approve rule whose whole condition is the approval signal", () => {
    expect(() =>
      validator.validate(
        policyWith({ fact: "humanApproved", operator: "is_true" }),
      ),
    ).not.toThrow();
  });

  it("accepts an approve rule that requires the approval signal in its top level all", () => {
    expect(() =>
      validator.validate(
        policyWith({
          all: [
            { fact: "riskScore", operator: "lte", value: 20 },
            { fact: "humanApproved", operator: "is_true" },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it.each<[string, PolicyCondition]>([
    ["always", { always: true }],
    [
      "a caller declared fact",
      { fact: "riskScore", operator: "lte", value: 20 },
    ],
    [
      "the approval signal only inside an any",
      {
        any: [
          { fact: "humanApproved", operator: "is_true" },
          { fact: "riskScore", operator: "lte", value: 20 },
        ],
      },
    ],
    [
      "the approval signal only inside a nested all",
      {
        all: [
          { all: [{ fact: "humanApproved", operator: "is_true" }] },
          { fact: "riskScore", operator: "lte", value: 20 },
        ],
      },
    ],
    [
      "the approval signal compared with eq instead of is_true",
      {
        all: [
          { fact: "humanApproved", operator: "eq", value: true },
          { fact: "riskScore", operator: "lte", value: 20 },
        ],
      },
    ],
  ])("refuses an approve rule gated by %s", (_name, condition) => {
    expect(() => validator.validate(policyWith(condition))).toThrow(
      /'approve' approves without a signed human approval/,
    );
  });

  it("refuses an approve rule on a fact that is not declared in approvalSignals", () => {
    expect(() =>
      validator.validate({
        ...policyWith({ fact: "humanApproved", operator: "is_true" }, null),
        unboundSignalReasons: {
          riskScore: "test fixture",
          humanApproved: "declared by the caller",
        },
      }),
    ).toThrow(/approves without a signed human approval/);
  });

  it("accepts a policy that only rejects", () => {
    expect(() =>
      validator.validate({
        policyId: "test-policy",
        policyVersion: "1.0.0",
        schemaVersion: "1.0.0",
        rules: [
          {
            id: "reject-default",
            condition: { always: true },
            outcome: { action: "reject" as never, reason: "rejects" },
          },
        ],
      }),
    ).not.toThrow();
  });
});
