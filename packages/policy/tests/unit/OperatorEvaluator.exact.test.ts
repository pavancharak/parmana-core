import { describe, expect, it } from "vitest";

import type { JsonValue } from "@parmana/shared";

import { OperatorEvaluator } from "../../src/OperatorEvaluator.js";
import type { PolicyOperator } from "../../src/types/Policy.js";

/**
 * Every policy rule condition is decided here. Mutation testing found
 * that most operators were tested only with one clearly true and one
 * clearly false case: their boundaries, and what they do with a value
 * of the wrong type, could change without a test failing.
 *
 * Each operator is pinned at its boundary and against values of the
 * wrong type. A value of the wrong type never satisfies a numeric,
 * collection, string or length operator: it evaluates to false, never
 * to a coerced comparison ("150000" is not greater than 100000).
 */

const evaluator = new OperatorEvaluator();
const evaluate = (
  actual: JsonValue | undefined,
  operator: PolicyOperator,
  expected?: JsonValue,
) => evaluator.evaluate(actual as JsonValue, operator, expected);

describe("OperatorEvaluator, exactly", () => {
  describe("equality is strict", () => {
    it("eq and neq do not coerce types", () => {
      expect(evaluate("10", "eq", 10)).toBe(false);
      expect(evaluate("10", "neq", 10)).toBe(true);
      expect(evaluate(null, "eq", null)).toBe(true);
      expect(evaluate(null, "neq", null)).toBe(false);
    });
  });

  describe("numeric comparisons", () => {
    it.each([
      // operator, [99, 100, 101] against 100
      ["gt", [false, false, true]],
      ["gte", [false, true, true]],
      ["lt", [true, false, false]],
      ["lte", [true, true, false]],
    ] as const)("%s at the boundary", (operator, expected) => {
      expect([99, 100, 101].map((n) => evaluate(n, operator, 100))).toEqual(
        expected,
      );
    });

    it.each(["gt", "gte", "lt", "lte"] as const)(
      "%s is false when either side is not a number, never a coerced comparison",
      (operator) => {
        // Each pair would be true under JavaScript coercion.
        const coercible: Record<string, [JsonValue, JsonValue]> = {
          gt: ["150000", 100000],
          gte: ["100000", 100000],
          lt: ["5", 10],
          lte: ["10", 10],
        };
        const [actual, bound] = coercible[operator]!;
        expect(evaluate(actual, operator, bound)).toBe(false);
        expect(evaluate(Number(actual), operator, String(bound))).toBe(false);
        expect(evaluate(true, operator, 0)).toBe(false);
        expect(evaluate(null, operator, -1)).toBe(false);
        expect(evaluate(undefined, operator, -1)).toBe(false);
      },
    );

    it("between is inclusive at both ends", () => {
      expect(
        [9, 10, 15, 20, 21].map((n) => evaluate(n, "between", [10, 20])),
      ).toEqual([false, true, true, true, false]);
    });

    it.each([
      ["a non-number value", "15", [10, 20]],
      ["a bound that is not an array", 15, 10],
      ["one bound", 15, [10]],
      ["three bounds", 15, [10, 20, 30]],
      ["a non-number lower bound", 15, ["10", 20]],
      ["a non-number upper bound", 15, [10, "20"]],
    ] as const)("between is false for %s", (_label, actual, bound) => {
      expect(evaluate(actual, "between", bound as JsonValue)).toBe(false);
    });
  });

  describe("collections", () => {
    it("in and not_in need an array of allowed values", () => {
      expect(evaluate("a", "in", ["a", "b"])).toBe(true);
      expect(evaluate("c", "in", ["a", "b"])).toBe(false);
      expect(evaluate("a", "in", "abc")).toBe(false);
      expect(evaluate("c", "not_in", ["a", "b"])).toBe(true);
      expect(evaluate("a", "not_in", ["a", "b"])).toBe(false);
      // Not an array: not_in is false too, never "not in, so allowed".
      expect(evaluate("c", "not_in", "abc")).toBe(false);
    });

    it("contains and not_contains need an array value and an expected item", () => {
      expect(evaluate(["a", "b"], "contains", "a")).toBe(true);
      expect(evaluate(["a", "b"], "contains", "c")).toBe(false);
      expect(evaluate("abc", "contains", "a")).toBe(false);
      expect(evaluate(["a"], "contains", undefined)).toBe(false);
      expect(evaluate(["a", "b"], "not_contains", "c")).toBe(true);
      expect(evaluate(["a", "b"], "not_contains", "a")).toBe(false);
      expect(evaluate("abc", "not_contains", "z")).toBe(false);
      expect(evaluate(["a"], "not_contains", undefined)).toBe(false);
    });

    it("contains_all needs every item, contains_any at least one", () => {
      expect(evaluate(["a", "b", "c"], "contains_all", ["a", "c"])).toBe(true);
      expect(evaluate(["a", "b"], "contains_all", ["a", "c"])).toBe(false);
      expect(evaluate("ac", "contains_all", ["a", "c"])).toBe(false);
      expect(evaluate(["a", "c"], "contains_all", "a")).toBe(false);
      expect(evaluate(["a", "b"], "contains_any", ["c", "b"])).toBe(true);
      expect(evaluate(["a", "b"], "contains_any", ["c", "d"])).toBe(false);
      expect(evaluate("ab", "contains_any", ["a"])).toBe(false);
      expect(evaluate(["a"], "contains_any", "a")).toBe(false);
    });
  });

  describe("strings", () => {
    it.each([
      ["starts_with", "refund-1", "refund", "-1"],
      ["ends_with", "refund-1", "-1", "refund"],
      ["matches", "refund-1", "^refund-\\d$", "^\\d"],
    ] as const)("%s", (operator, actual, hit, miss) => {
      expect(evaluate(actual, operator, hit)).toBe(true);
      expect(evaluate(actual, operator, miss)).toBe(false);
      expect(evaluate(12345, operator, "1")).toBe(false);
      expect(evaluate(actual, operator, 1)).toBe(false);
    });
  });

  describe("existence, booleans and null", () => {
    it("exists is false for null and a missing fact; not_exists the reverse", () => {
      for (const present of [0, "", false, [], {}]) {
        expect(evaluate(present, "exists")).toBe(true);
        expect(evaluate(present, "not_exists")).toBe(false);
      }
      for (const absent of [null, undefined]) {
        expect(evaluate(absent, "exists")).toBe(false);
        expect(evaluate(absent, "not_exists")).toBe(true);
      }
    });

    it("is_true and is_false accept only the booleans themselves", () => {
      expect(evaluate(true, "is_true")).toBe(true);
      expect(evaluate("true", "is_true")).toBe(false);
      expect(evaluate(1, "is_true")).toBe(false);
      expect(evaluate(false, "is_false")).toBe(true);
      expect(evaluate(0, "is_false")).toBe(false);
      expect(evaluate(null, "is_false")).toBe(false);
    });

    it("is_null matches only null", () => {
      expect(evaluate(null, "is_null")).toBe(true);
      expect(evaluate(0, "is_null")).toBe(false);
      expect(evaluate(null, "is_not_null")).toBe(false);
      expect(evaluate("", "is_not_null")).toBe(true);
    });
  });

  describe("length", () => {
    it.each([
      // operator, [length 2, 3, 4] against 3
      ["length_eq", [false, true, false]],
      ["length_gt", [false, false, true]],
      ["length_gte", [false, true, true]],
      ["length_lt", [true, false, false]],
      ["length_lte", [true, true, false]],
    ] as const)("%s at the boundary", (operator, expected) => {
      expect(
        ["ab", "abc", "abcd"].map((s) => evaluate(s, operator, 3)),
      ).toEqual(expected);
    });

    it("measures strings, arrays and objects; anything else has length 0", () => {
      expect(evaluate("abc", "length_eq", 3)).toBe(true);
      expect(evaluate([1, 2, 3], "length_eq", 3)).toBe(true);
      expect(evaluate({ a: 1, b: 2, c: 3 }, "length_eq", 3)).toBe(true);
      expect(evaluate(12345, "length_eq", 0)).toBe(true);
      expect(evaluate(null, "length_eq", 0)).toBe(true);
    });

    it.each([
      "length_eq",
      "length_gt",
      "length_gte",
      "length_lt",
      "length_lte",
    ] as const)("%s is false when the bound is not a number", (operator) => {
      expect(evaluate("abc", operator, "3")).toBe(false);
    });
  });

  describe("type_is", () => {
    it.each([
      ["a", "string"],
      [1, "number"],
      [true, "boolean"],
      [null, "null"],
      [[1], "array"],
      [{ a: 1 }, "object"],
    ] as const)("%j is a %s, and nothing else", (value, type) => {
      expect(evaluate(value as JsonValue, "type_is", type)).toBe(true);
      for (const other of [
        "string",
        "number",
        "boolean",
        "null",
        "array",
        "object",
      ].filter((t) => t !== type)) {
        expect(evaluate(value as JsonValue, "type_is", other)).toBe(false);
      }
    });

    it("is false when the expected type is not a string", () => {
      expect(evaluate("a", "type_is", 1)).toBe(false);
    });
  });

  it("throws on an unsupported operator, naming it", () => {
    expect(() => evaluate(1, "approximately" as PolicyOperator, 1)).toThrow(
      "Unsupported policy operator: approximately",
    );
  });
});
