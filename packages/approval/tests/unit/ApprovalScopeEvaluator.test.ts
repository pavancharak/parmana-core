import { describe, expect, it } from "vitest";

import type { ApprovalScope } from "@parmana/shared";

import { evaluateApprovalScope } from "../../src/ApprovalScopeEvaluator.js";

/**
 * evaluateApprovalScope decides whether an approval's bound (for example
 * "refund amount lte 5000") covers the value actually executed. Mutation
 * testing found that only `eq` and `lte` were tested here: the other four
 * comparators, the boundaries, and the refusals of non-number input could
 * all be changed without a test failing. Each comparator is checked just
 * below, at, and just above its bound.
 */

type Comparator = ApprovalScope["comparator"];

const evaluate = (actual: unknown, comparator: Comparator, value: unknown) =>
  evaluateApprovalScope(actual, {
    comparator,
    value: value as ApprovalScope["value"],
  });

describe("evaluateApprovalScope", () => {
  it.each([
    // comparator, bound, [below, at, above]
    ["lte", 100, [true, true, false]],
    ["lt", 100, [true, false, false]],
    ["gte", 100, [false, true, true]],
    ["gt", 100, [false, false, true]],
  ] as const)(
    "%s %d: 99, 100 and 101 give %j",
    (comparator, bound, expected) => {
      expect([99, 100, 101].map((n) => evaluate(n, comparator, bound))).toEqual(
        expected,
      );
    },
  );

  it("between is inclusive at both ends and refuses values outside", () => {
    const range = { min: 10, max: 20 };
    expect(
      [9, 10, 15, 20, 21].map((n) => evaluate(n, "between", range)),
    ).toEqual([false, true, true, true, false]);
  });

  it("eq is strict: the same number as a string does not match", () => {
    expect(evaluate("order-1", "eq", "order-1")).toBe(true);
    expect(evaluate(100, "eq", 100)).toBe(true);
    expect(evaluate("100", "eq", 100)).toBe(false);
    expect(evaluate("order-2", "eq", "order-1")).toBe(false);
  });

  it.each(["lte", "lt", "gte", "gt", "between"] as const)(
    "%s refuses a value that is not a number, even a numeric string",
    (comparator) => {
      const bound = comparator === "between" ? { min: 0, max: 1000 } : 1000;
      expect(evaluate("50", comparator, bound)).toBe(false);
      expect(evaluate(undefined, comparator, bound)).toBe(false);
      expect(evaluate(null, comparator, bound)).toBe(false);
    },
  );

  it.each(["lte", "lt", "gte", "gt"] as const)(
    "%s refuses when the bound itself is not a number",
    (comparator) => {
      expect(evaluate(50, comparator, "1000")).toBe(false);
      expect(evaluate(50, comparator, { min: 0, max: 1000 })).toBe(false);
    },
  );

  it.each([
    ["not an object", 1000],
    ["null", null],
    ["min missing", { max: 1000 }],
    ["max missing", { min: 0 }],
    ["min not a number", { min: "0", max: 1000 }],
    ["max not a number", { min: 0, max: "1000" }],
  ])("between refuses a malformed range (%s)", (_label, range) => {
    expect(evaluate(50, "between", range)).toBe(false);
  });

  it("refuses an unknown comparator", () => {
    expect(evaluate(50, "ne" as Comparator, 100)).toBe(false);
  });
});
