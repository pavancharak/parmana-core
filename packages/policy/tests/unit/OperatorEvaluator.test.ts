import { describe, expect, it } from "vitest";

import { OperatorEvaluator } from "../../src/OperatorEvaluator.js";

describe("OperatorEvaluator", () => {
  const evaluator = new OperatorEvaluator();

  describe("Equality", () => {
    it("eq", () => {
      expect(evaluator.evaluate(10, "eq", 10)).toBe(true);

      expect(evaluator.evaluate(10, "eq", 5)).toBe(false);
    });

    it("neq", () => {
      expect(evaluator.evaluate(10, "neq", 5)).toBe(true);

      expect(evaluator.evaluate(10, "neq", 10)).toBe(false);
    });
  });

  describe("Numeric", () => {
    it("gt", () => {
      expect(evaluator.evaluate(10, "gt", 5)).toBe(true);

      expect(evaluator.evaluate(5, "gt", 10)).toBe(false);
    });

    it("gte", () => {
      expect(evaluator.evaluate(10, "gte", 10)).toBe(true);

      expect(evaluator.evaluate(9, "gte", 10)).toBe(false);
    });

    it("lt", () => {
      expect(evaluator.evaluate(5, "lt", 10)).toBe(true);

      expect(evaluator.evaluate(10, "lt", 5)).toBe(false);
    });

    it("lte", () => {
      expect(evaluator.evaluate(10, "lte", 10)).toBe(true);

      expect(evaluator.evaluate(11, "lte", 10)).toBe(false);
    });

    it("between", () => {
      expect(evaluator.evaluate(15, "between", [10, 20])).toBe(true);

      expect(evaluator.evaluate(25, "between", [10, 20])).toBe(false);
    });
  });

  describe("Collection", () => {
    it("in", () => {
      expect(evaluator.evaluate("admin", "in", ["admin", "user"])).toBe(true);
    });

    it("not_in", () => {
      expect(evaluator.evaluate("guest", "not_in", ["admin", "user"])).toBe(
        true,
      );
    });

    it("contains", () => {
      expect(evaluator.evaluate(["a", "b", "c"], "contains", "b")).toBe(true);
    });

    it("not_contains", () => {
      expect(evaluator.evaluate(["a", "b"], "not_contains", "z")).toBe(true);
    });

    it("contains_all", () => {
      expect(
        evaluator.evaluate(["a", "b", "c"], "contains_all", ["a", "c"]),
      ).toBe(true);
    });

    it("contains_any", () => {
      expect(evaluator.evaluate(["a", "b"], "contains_any", ["x", "b"])).toBe(
        true,
      );
    });
  });

  describe("String", () => {
    it("starts_with", () => {
      expect(evaluator.evaluate("production", "starts_with", "prod")).toBe(
        true,
      );
    });

    it("ends_with", () => {
      expect(evaluator.evaluate("production", "ends_with", "tion")).toBe(true);
    });

    it("matches", () => {
      expect(evaluator.evaluate("abc123", "matches", "^[a-z]+\\d+$")).toBe(
        true,
      );
    });
  });

  describe("Existence", () => {
    it("exists", () => {
      expect(evaluator.evaluate("hello", "exists")).toBe(true);
    });

    it("not_exists", () => {
      expect(evaluator.evaluate(null, "not_exists")).toBe(true);
    });
  });

  describe("Boolean", () => {
    it("is_true", () => {
      expect(evaluator.evaluate(true, "is_true")).toBe(true);
    });

    it("is_false", () => {
      expect(evaluator.evaluate(false, "is_false")).toBe(true);
    });
  });

  describe("Null", () => {
    it("is_null", () => {
      expect(evaluator.evaluate(null, "is_null")).toBe(true);
    });

    it("is_not_null", () => {
      expect(evaluator.evaluate("abc", "is_not_null")).toBe(true);
    });
  });

  describe("Length", () => {
    it("length_eq", () => {
      expect(evaluator.evaluate("abcd", "length_eq", 4)).toBe(true);
    });

    it("length_gt", () => {
      expect(evaluator.evaluate("abcdef", "length_gt", 5)).toBe(true);
    });

    it("length_gte", () => {
      expect(evaluator.evaluate("abc", "length_gte", 3)).toBe(true);
    });

    it("length_lt", () => {
      expect(evaluator.evaluate("abc", "length_lt", 5)).toBe(true);
    });

    it("length_lte", () => {
      expect(evaluator.evaluate("abc", "length_lte", 3)).toBe(true);
    });
  });

  describe("Type", () => {
    it("type_is", () => {
      expect(evaluator.evaluate(123, "type_is", "number")).toBe(true);

      expect(evaluator.evaluate("abc", "type_is", "string")).toBe(true);

      expect(evaluator.evaluate(true, "type_is", "boolean")).toBe(true);

      expect(evaluator.evaluate(null, "type_is", "null")).toBe(true);

      expect(evaluator.evaluate([], "type_is", "array")).toBe(true);
    });
  });
});
