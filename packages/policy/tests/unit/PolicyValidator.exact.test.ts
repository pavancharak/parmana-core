import { describe, expect, it } from "vitest";

import { PolicyValidator } from "../../src/PolicyValidator.js";
import type { Policy, PolicyCondition } from "../../src/types/Policy.js";

/**
 * Mutation testing scored PolicyValidator 47.4%: most of its refusals
 * were tested with a loose pattern or not at all, and the advisory rule
 * overlap analysis was barely exercised. Every refusal is pinned here
 * with its exact message, and every overlap case with its exact result.
 */

const validator = new PolicyValidator();

const REJECT_ALL = {
  id: "reject",
  condition: { always: true },
  outcome: { action: "reject", reason: "Rejected." },
};

function policy(overrides: Record<string, unknown> = {}): Policy {
  return {
    policyId: "p",
    policyVersion: "1.0.0",
    schemaVersion: "1.0.0",
    rules: [REJECT_ALL],
    ...overrides,
  } as unknown as Policy;
}

/** A policy whose one non-default rule reads `facts`, all acknowledged. */
function withRule(
  condition: unknown,
  extra: Record<string, unknown> = {},
  facts: string[] = ["amount"],
): Policy {
  return policy({
    unboundSignalReasons: Object.fromEntries(
      facts.map((fact) => [fact, "Checked elsewhere."]),
    ),
    rules: [
      {
        id: "r1",
        condition,
        outcome: { action: "reject", reason: "No." },
      },
      REJECT_ALL,
    ],
    ...extra,
  });
}

const refuses = (value: Policy, message: string) =>
  expect(() => validator.validate(value)).toThrow(message);
const accepts = (value: Policy) =>
  expect(() => validator.validate(value)).not.toThrow();

describe("PolicyValidator refusals, exactly", () => {
  it("accepts the minimal policy", () => {
    accepts(policy());
  });

  it.each([
    ["policyId", 1],
    ["policyVersion", false],
    ["schemaVersion", null],
  ])(
    "refuses a non-string %s as missing, without a TypeError",
    (field, value) => {
      refuses(policy({ [field]: value }), `${field} is required.`);
    },
  );

  it("refuses a rule, condition or outcome that is not an object", () => {
    refuses(policy({ rules: [null] }), "Each policy rule must be an object.");
    refuses(policy({ rules: ["r"] }), "Each policy rule must be an object.");
    refuses(
      policy({ rules: [{ ...REJECT_ALL, condition: null }] }),
      "Invalid policy condition.",
    );
    refuses(withRule({ any: [false] }), "Invalid policy condition.");
    refuses(
      policy({ rules: [{ ...REJECT_ALL, outcome: "reject" }] }),
      "Policy rule 'reject' is missing an outcome.",
    );
    refuses(
      policy({ rules: [{ ...REJECT_ALL, id: 7 }] }),
      "Policy rule id is required.",
    );
    refuses(
      withRule({ fact: 5, operator: "eq", value: 1 }),
      "Policy condition fact is required.",
    );
  });

  it("refuses no policy", () => {
    refuses(null as unknown as Policy, "Policy is required.");
  });

  it.each(["policyId", "policyVersion", "schemaVersion"])(
    "refuses a missing, empty or blank %s",
    (field) => {
      for (const value of [undefined, "", "  "]) {
        refuses(policy({ [field]: value }), `${field} is required.`);
      }
    },
  );

  it("refuses rules that are not a non-empty array", () => {
    refuses(policy({ rules: {} }), "Policy rules must be an array.");
    refuses(policy({ rules: undefined }), "Policy rules must be an array.");
    refuses(policy({ rules: [] }), "Policy must contain at least one rule.");
  });

  describe("boundSignals", () => {
    it.each([[null], [[]], ["parameters.amount"]])(
      "refuses %j as boundSignals",
      (boundSignals) => {
        refuses(
          policy({ boundSignals }),
          "Policy boundSignals must be an object.",
        );
      },
    );

    it("refuses a blank key, and a path that is not a non-empty string", () => {
      refuses(
        policy({ boundSignals: { " ": "parameters.a" } }),
        "Policy boundSignals keys cannot be empty.",
      );
      for (const path of [5, "", "  "]) {
        refuses(
          policy({ boundSignals: { amount: path } }),
          "Policy boundSignals['amount'] must be a non-empty string dot-path.",
        );
      }
    });

    it("accepts bound facts as coverage", () => {
      accepts(
        withRule(
          { fact: "amount", operator: "gt", value: 1 },
          {
            unboundSignalReasons: undefined,
            boundSignals: { amount: "parameters.amount" },
          },
          [],
        ),
      );
    });
  });

  describe("unboundSignalReasons", () => {
    it.each([[null], [[]], ["reason"]])(
      "refuses %j",
      (unboundSignalReasons) => {
        refuses(
          policy({ unboundSignalReasons }),
          "Policy unboundSignalReasons must be an object.",
        );
      },
    );

    it("refuses a blank key, a reason that is not a non-empty string, and a bound fact", () => {
      refuses(
        policy({ unboundSignalReasons: { " ": "why" } }),
        "Policy unboundSignalReasons keys cannot be empty.",
      );
      for (const reason of [5, "", "  "]) {
        refuses(
          policy({ unboundSignalReasons: { risk: reason } }),
          "Policy unboundSignalReasons['risk'] must be a non-empty reason string.",
        );
      }
      refuses(
        policy({
          boundSignals: { risk: "parameters.risk" },
          unboundSignalReasons: { risk: "why" },
        }),
        "Policy unboundSignalReasons['risk'] is contradictory: 'risk' already has a boundSignals entry -- a bound fact needs no reason for being unbound.",
      );
    });
  });

  describe("rules", () => {
    const rule = (overrides: Record<string, unknown>) => ({
      ...REJECT_ALL,
      ...overrides,
    });

    it("refuses a missing or blank id, and a duplicate id", () => {
      for (const id of [undefined, "", "  "]) {
        refuses(
          policy({ rules: [rule({ id })] }),
          "Policy rule id is required.",
        );
      }
      refuses(
        policy({ rules: [rule({}), rule({})] }),
        "Duplicate policy rule id 'reject'.",
      );
    });

    it("refuses a missing outcome, action or reason", () => {
      refuses(
        policy({ rules: [rule({ outcome: undefined })] }),
        "Policy rule 'reject' is missing an outcome.",
      );
      refuses(
        policy({ rules: [rule({ outcome: { action: "", reason: "r" } })] }),
        "Policy rule 'reject' is missing an outcome action.",
      );
      for (const reason of [undefined, "", "  "]) {
        refuses(
          policy({ rules: [rule({ outcome: { action: "reject", reason } })] }),
          "Policy rule 'reject' is missing an outcome reason.",
        );
      }
    });
  });

  describe("conditions", () => {
    it("refuses a blank fact and an unknown operator", () => {
      refuses(
        withRule({ fact: "  ", operator: "eq", value: 1 }),
        "Policy condition fact is required.",
      );
      refuses(
        withRule({ fact: "amount", operator: "approximately", value: 1 }),
        "Unsupported operator 'approximately'.",
      );
    });

    it.each([
      "eq",
      "neq",
      "gt",
      "gte",
      "lt",
      "lte",
      "between",
      "in",
      "not_in",
      "contains",
      "not_contains",
      "contains_all",
      "contains_any",
      "starts_with",
      "ends_with",
      "exists",
      "not_exists",
      "is_true",
      "is_false",
      "is_null",
      "is_not_null",
      "length_eq",
      "length_gt",
      "length_gte",
      "length_lt",
      "length_lte",
      "type_is",
    ])("accepts the operator %s", (operator) => {
      accepts(withRule({ fact: "amount", operator, value: 1 }));
    });

    it("refuses empty or non-array all and any, and checks their children", () => {
      for (const key of ["all", "any"]) {
        for (const children of [[], "x"]) {
          refuses(
            withRule({ [key]: children }),
            `'${key}' must contain at least one condition.`,
          );
        }
        refuses(
          withRule({ [key]: [{ fact: "amount", operator: "nope" }] }),
          "Unsupported operator 'nope'.",
        );
        accepts(
          withRule({ [key]: [{ fact: "amount", operator: "gt", value: 1 }] }),
        );
      }
    });

    it("refuses always other than true, and a condition of no known kind", () => {
      refuses(withRule({ always: false }, {}, []), "'always' must be true.");
      refuses(withRule({}, {}, []), "Invalid policy condition.");
    });
  });

  describe("matches", () => {
    const matching = (value: unknown) =>
      withRule({ fact: "amount", operator: "matches", value });

    it("needs a regex string", () => {
      refuses(matching(5), "'matches' requires a regex string.");
    });

    it("accepts 200 characters, refuses 201", () => {
      accepts(matching("a".repeat(200)));
      refuses(
        matching("a".repeat(201)),
        "'matches' pattern exceeds the maximum length of 200 characters.",
      );
    });

    it.each([
      "(a+)+",
      "(a+){2}",
      "(a{2,3})+",
      "(a+){10}",
      "(a*)*",
      "(a+){2,}",
      "(a{2})+",
      "x(b+)*y",
      "(a)(b+)+",
    ])("refuses the nested quantifier %s", (pattern) => {
      refuses(
        matching(pattern),
        `'matches' pattern '${pattern}' contains a nested quantifier (a quantified group whose own contents are themselves quantified, e.g. '(a+)+') -- a common source of catastrophic backtracking (ReDoS) once evaluated against live signal values. Rewrite the pattern to avoid quantifying a group that already contains a quantifier.`,
      );
    });

    it.each(["(ab)+", "(a|b)*", "a+(b)", "(a+)", "^ref-\\d+$"])(
      "accepts %s",
      (pattern) => {
        accepts(matching(pattern));
      },
    );

    it("refuses a pattern that is not a regular expression", () => {
      refuses(matching("[a-"), "Invalid regular expression '[a-'.");
    });
  });

  it("names every fact neither bound nor acknowledged", () => {
    refuses(
      policy({
        rules: [
          {
            id: "r1",
            condition: {
              all: [
                { fact: "amount", operator: "gt", value: 1 },
                { fact: "risk", operator: "lt", value: 5 },
              ],
            },
            outcome: { action: "reject", reason: "No." },
          },
          REJECT_ALL,
        ],
      }),
      "Policy references fact(s) 'amount', 'risk' with no boundSignals entry and no unboundSignalReasons entry. Add one of:\n  1. A boundSignals entry, if the fact has a genuine Intent-side equivalent (e.g. an amount or target identifier).\n  2. An unboundSignalReasons entry with a documented reason, if leaving it unbound is a deliberate decision.",
    );
  });
});

describe("PolicyValidator approvalSignals and approve rules, exactly", () => {
  const approving = (
    approvalSignals: unknown,
    condition: unknown = { fact: "approved", operator: "is_true" },
    extra: Record<string, unknown> = {},
  ) =>
    policy({
      approvalSignals,
      rules: [
        {
          id: "approve",
          condition,
          outcome: { action: "approve", reason: "Yes." },
        },
        REJECT_ALL,
      ],
      ...extra,
    });

  it("accepts target and parameter paths, with and without a value", () => {
    accepts(approving({ approved: { resourceId: "target" } }));
    accepts(
      approving({
        approved: {
          resourceId: "parameters.order.id",
          value: "parameters.amount",
        },
      }),
    );
  });

  it.each([[null], [[]], ["x"]])("refuses %j as approvalSignals", (value) => {
    refuses(approving(value), "Policy approvalSignals must be an object.");
  });

  it("refuses a blank key and a declaration that is not an object", () => {
    refuses(
      approving({ " ": { resourceId: "target" } }),
      "Policy approvalSignals keys cannot be empty.",
    );
    for (const declaration of [null, [], "target"]) {
      refuses(
        approving({ approved: declaration }),
        "Policy approvalSignals['approved'] must be an object.",
      );
    }
  });

  it("refuses a declaration no rule reads, or one also bound", () => {
    refuses(
      approving({
        approved: { resourceId: "target" },
        other: { resourceId: "target", artifact: "otherArtifact" },
      }),
      "Policy approvalSignals['other'] names a fact no rule references, so its approval would never matter.",
    );
    refuses(
      approving({ approved: { resourceId: "target" } }, undefined, {
        boundSignals: { approved: "parameters.approved" },
      }),
      "Policy approvalSignals['approved'] is contradictory: 'approved' already has a boundSignals entry.",
    );
  });

  it.each([
    "parameters",
    "params.id",
    "parameters.a-b",
    "parameters..a",
    "xparameters.a",
    "parameters.a ",
  ])("refuses the resource path %j, and the same as a value path", (path) => {
    refuses(
      approving({ approved: { resourceId: path } }),
      `Policy approvalSignals['approved'].resourceId must be "target" or a dot-path into the Intent's parameters, such as "parameters.orderId".`,
    );
    refuses(
      approving({ approved: { resourceId: "target", value: path } }),
      `Policy approvalSignals['approved'].value must be a dot-path into the Intent's parameters, such as "parameters.amount".`,
    );
  });

  it("refuses an artifact name with other characters, shared, equal to a key, or read by a rule", () => {
    refuses(
      approving({ approved: { resourceId: "target", artifact: "art-1" } }),
      "Policy approvalSignals['approved'].artifact must be a signal name of letters, digits and underscores.",
    );
    refuses(
      approving(
        {
          approved: { resourceId: "target" },
          second: { resourceId: "target" },
        },
        {
          all: [
            { fact: "approved", operator: "is_true" },
            { fact: "second", operator: "is_true" },
          ],
        },
      ),
      "Policy approvalSignals['second'].artifact 'approvalArtifact' is used by another approval signal. Give each approval signal its own artifact signal.",
    );
    refuses(
      approving(
        {
          approved: { resourceId: "target", artifact: "second" },
          second: { resourceId: "target", artifact: "secondArtifact" },
        },
        {
          all: [
            { fact: "approved", operator: "is_true" },
            { fact: "second", operator: "is_true" },
          ],
        },
      ),
      "Policy approvalSignals['approved'].artifact 'second' is used by another approval signal.",
    );
    refuses(
      approving(
        { approved: { resourceId: "target", artifact: "note" } },
        {
          all: [
            { fact: "approved", operator: "is_true" },
            { fact: "note", operator: "exists" },
          ],
        },
        { unboundSignalReasons: { note: "Free text." } },
      ),
      "Policy approvalSignals['approved'].artifact 'note' is read by a rule; it must only carry the approval.",
    );
  });

  it("accepts the approval inside the top level all, and refuses it anywhere else or with another operator", () => {
    const declared = { approved: { resourceId: "target" } };
    accepts(
      approving(
        declared,
        {
          all: [
            { fact: "approved", operator: "is_true" },
            { fact: "amount", operator: "lt", value: 5 },
          ],
        },
        { unboundSignalReasons: { amount: "Checked." } },
      ),
    );
    const message =
      "Policy rule 'approve' approves without a signed human approval. Every approve rule must require an approvalSignals fact with is_true, as its whole condition or directly inside its top level 'all'.";
    refuses(
      approving(
        declared,
        {
          any: [
            { fact: "approved", operator: "is_true" },
            { fact: "amount", operator: "lt", value: 5 },
          ],
        },
        { unboundSignalReasons: { amount: "Checked." } },
      ),
      message,
    );
    refuses(
      approving(declared, { fact: "approved", operator: "eq", value: true }),
      message,
    );
    refuses(
      approving(declared, {
        all: [{ all: [{ fact: "approved", operator: "is_true" }] }],
      }),
      message,
    );
    refuses(
      approving(
        undefined,
        { fact: "approved", operator: "is_true" },
        {
          unboundSignalReasons: { approved: "Declared." },
        },
      ),
      message,
    );
  });
});

describe("PolicyValidator.findRuleConflicts, exactly", () => {
  const rule = (id: string, condition: unknown) => ({
    id,
    condition,
    outcome: { action: "reject", reason: "r" },
  });
  const conflicts = (...conditions: unknown[]) =>
    validator.findRuleConflicts(
      policy({ rules: conditions.map((c, i) => rule(`r${i + 1}`, c)) }),
    );
  const leaf = (operator: string, value?: unknown, fact = "x") =>
    ({ fact, operator, value }) as PolicyCondition;
  const result = (a: unknown, b: unknown) => {
    const found = conflicts(a, b);
    return found.length === 0 ? "none" : found[0]!.level;
  };

  it("warns about an always rule that is not last, naming the next rule", () => {
    expect(conflicts({ always: true }, leaf("eq", 1), leaf("eq", 2))).toEqual([
      {
        level: "WARNING",
        ruleId: "r1",
        conflictingRuleId: "r2",
        message:
          "Rule 'r1' has an 'always: true' condition but is not the last rule -- every rule after it, starting with 'r2', can never be reached.",
      },
    ]);
    expect(conflicts(leaf("eq", 1), { always: true })).toEqual([]);
  });

  it("words a definite overlap and a case for review exactly", () => {
    expect(conflicts(leaf("eq", 1), leaf("eq", 1))).toEqual([
      {
        level: "WARNING",
        ruleId: "r1",
        conflictingRuleId: "r2",
        message:
          "Rule 'r1' and rule 'r2' have overlapping conditions on the same fact. First-match-wins means 'r1' takes precedence for any input that satisfies both; if that is not intended, reorder or refine the conditions.",
      },
    ]);
    expect(conflicts(leaf("in", [1]), leaf("in", [1]))).toEqual([
      {
        level: "INFO",
        ruleId: "r1",
        conflictingRuleId: "r2",
        message:
          "Rule 'r1' and rule 'r2' both reference conditions this checker does not fully analyze (a nested 'all'/'any', or an operator pairing it does not model) -- manual review recommended to confirm no unintended overlap.",
      },
    ]);
  });

  it("compares every later rule, not only the next", () => {
    expect(
      conflicts(leaf("eq", 1), leaf("eq", 2), leaf("eq", 1)).map(
        (w) => `${w.ruleId}-${w.conflictingRuleId}`,
      ),
    ).toEqual(["r1-r3"]);
  });

  it.each([
    ["different facts", leaf("eq", 1), leaf("eq", 1, "y"), "none"],
    ["eq, same value", leaf("eq", 1), leaf("eq", 1), "WARNING"],
    ["eq, other value", leaf("eq", 1), leaf("eq", 2), "none"],
    ["neq and neq", leaf("neq", 1), leaf("neq", 2), "WARNING"],
    ["eq and neq, same value", leaf("eq", 1), leaf("neq", 1), "none"],
    ["neq and eq, same value", leaf("neq", 1), leaf("eq", 1), "none"],
    ["eq and neq, other value", leaf("eq", 1), leaf("neq", 2), "WARNING"],
    ["is_true twice", leaf("is_true"), leaf("is_true"), "WARNING"],
    ["is_true and is_false", leaf("is_true"), leaf("is_false"), "none"],
    ["is_false and eq false", leaf("is_false"), leaf("eq", false), "WARNING"],
    ["is_true and eq true", leaf("is_true"), leaf("eq", true), "WARNING"],
    ["gt 10 and lt 5", leaf("gt", 10), leaf("lt", 5), "none"],
    ["gt 10 and lt 20", leaf("gt", 10), leaf("lt", 20), "WARNING"],
    ["lt 20 and gt 10", leaf("lt", 20), leaf("gt", 10), "WARNING"],
    ["lte 10 and gte 10", leaf("lte", 10), leaf("gte", 10), "WARNING"],
    ["lt 10 and gte 10", leaf("lt", 10), leaf("gte", 10), "none"],
    ["lte 10 and gt 10", leaf("lte", 10), leaf("gt", 10), "none"],
    ["gte 10 and lte 10", leaf("gte", 10), leaf("lte", 10), "WARNING"],
    ["gt 5 and gt 10", leaf("gt", 5), leaf("gt", 10), "WARNING"],
    ["lt 5 and lte 10", leaf("lt", 5), leaf("lte", 10), "WARNING"],
    ["gt and a text bound", leaf("gt", 5), leaf("lt", "10"), "INFO"],
    ["a text bound and lt", leaf("gt", "5"), leaf("lt", 10), "INFO"],
    ["eq 15, gt 10", leaf("eq", 15), leaf("gt", 10), "WARNING"],
    ["eq 10, gt 10", leaf("eq", 10), leaf("gt", 10), "none"],
    ["eq 10, gte 10", leaf("eq", 10), leaf("gte", 10), "WARNING"],
    ["eq 9, gte 10", leaf("eq", 9), leaf("gte", 10), "none"],
    ["eq 9, lt 10", leaf("eq", 9), leaf("lt", 10), "WARNING"],
    ["eq 10, lt 10", leaf("eq", 10), leaf("lt", 10), "none"],
    ["eq 10, lte 10", leaf("eq", 10), leaf("lte", 10), "WARNING"],
    ["eq 11, lte 10", leaf("eq", 11), leaf("lte", 10), "none"],
    ["gt 10, eq 15", leaf("gt", 10), leaf("eq", 15), "WARNING"],
    ["gt 10, eq 5", leaf("gt", 10), leaf("eq", 5), "none"],
    ["lte 10, eq 11", leaf("lte", 10), leaf("eq", 11), "none"],
    ["eq text, gt", leaf("eq", "a"), leaf("gt", 1), "INFO"],
    ["gt, eq text", leaf("gt", 1), leaf("eq", "a"), "INFO"],
    ["neq and gt", leaf("neq", 1), leaf("gt", 1), "INFO"],
    ["in and eq", leaf("in", [1]), leaf("eq", 1), "INFO"],
  ])("%s: %s", (_label, a, b, expected) => {
    expect(result(a, b)).toBe(expected);
  });

  describe("with all", () => {
    const all = (...conditions: unknown[]) => ({ all: conditions });

    it.each([
      [
        "leaf against an all it contradicts",
        leaf("eq", 1),
        all(leaf("eq", 2), leaf("eq", 3, "y")),
        "none",
      ],
      [
        "an all against a leaf it contradicts",
        all(leaf("eq", 3, "y"), leaf("eq", 2)),
        leaf("eq", 1),
        "none",
      ],
      [
        "leaf against an all on other facts",
        leaf("eq", 1),
        all(leaf("eq", 2, "y")),
        "INFO",
      ],
      [
        "leaf against an all it agrees with",
        leaf("eq", 1),
        all(leaf("eq", 1)),
        "INFO",
      ],
      [
        "leaf against an all with a nested any",
        leaf("eq", 1),
        all({ any: [leaf("eq", 2)] }),
        "INFO",
      ],
      [
        "two alls that contradict",
        all(leaf("eq", 1, "y"), leaf("eq", 1)),
        all(leaf("eq", 2)),
        "none",
      ],
      [
        "two alls that contradict on a later fact",
        all(leaf("eq", 1)),
        all(leaf("eq", 5, "y"), leaf("eq", 2)),
        "none",
      ],
      ["two alls that agree", all(leaf("eq", 1)), all(leaf("eq", 1)), "INFO"],
      [
        "two alls with nested conditions",
        all({ any: [leaf("eq", 1)] }),
        all(leaf("eq", 2)),
        "INFO",
      ],
      ["an any and a leaf", { any: [leaf("eq", 2)] }, leaf("eq", 1), "INFO"],
    ])("%s", (_label, a, b, expected) => {
      expect(result(a, b)).toBe(expected);
    });
  });
});
