import type { JsonValue } from "@parmana/shared";

import type { PolicyOperator } from "./types/Policy.js";

/**
 * Canonical deterministic operator evaluator.
 *
 * Responsibilities
 * ----------------
 * - Evaluate deterministic policy operators.
 * - Perform no side effects.
 * - Never mutate runtime state.
 * - Never access external systems.
 *
 * Given identical inputs, this evaluator SHALL
 * always produce identical outputs.
 */
export class OperatorEvaluator {
  /**
   * Evaluates a policy operator.
   */
  public evaluate(
    actual: JsonValue,
    operator: PolicyOperator,
    expected?: JsonValue,
  ): boolean {
    switch (operator) {
      //
      // Equality
      //

      case "eq":
        return actual === expected;

      case "neq":
        return actual !== expected;

      //
      // Numeric
      //

      case "gt":
        return (
          this.isNumber(actual) && this.isNumber(expected) && actual > expected
        );

      case "gte":
        return (
          this.isNumber(actual) && this.isNumber(expected) && actual >= expected
        );

      case "lt":
        return (
          this.isNumber(actual) && this.isNumber(expected) && actual < expected
        );

      case "lte":
        return (
          this.isNumber(actual) && this.isNumber(expected) && actual <= expected
        );

      case "between":
        return (
          this.isNumber(actual) &&
          Array.isArray(expected) &&
          expected.length === 2 &&
          this.isNumber(expected[0]) &&
          this.isNumber(expected[1]) &&
          actual >= expected[0] &&
          actual <= expected[1]
        );

      //
      // Collection
      //

      case "in":
        return Array.isArray(expected) && expected.includes(actual);

      case "not_in":
        return Array.isArray(expected) && !expected.includes(actual);

      case "contains":
        return (
          Array.isArray(actual) &&
          expected !== undefined &&
          actual.includes(expected)
        );

      case "not_contains":
        return (
          Array.isArray(actual) &&
          expected !== undefined &&
          !actual.includes(expected)
        );

      case "contains_all":
        return (
          Array.isArray(actual) &&
          Array.isArray(expected) &&
          expected.every((value) => actual.includes(value))
        );

      case "contains_any":
        return (
          Array.isArray(actual) &&
          Array.isArray(expected) &&
          expected.some((value) => actual.includes(value))
        );

      //
      // String
      //

      case "starts_with":
        return (
          this.isString(actual) &&
          this.isString(expected) &&
          actual.startsWith(expected)
        );

      case "ends_with":
        return (
          this.isString(actual) &&
          this.isString(expected) &&
          actual.endsWith(expected)
        );

      case "matches":
        return (
          this.isString(actual) &&
          this.isString(expected) &&
          this.matches(actual, expected)
        );

      //
      // Existence
      //

      case "exists":
        return actual !== undefined && actual !== null;

      case "not_exists":
        return actual === undefined || actual === null;

      //
      // Boolean
      //

      case "is_true":
        return actual === true;

      case "is_false":
        return actual === false;

      //
      // Null
      //

      case "is_null":
        return actual === null;

      case "is_not_null":
        return actual !== null;

      //
      // Length
      //

      case "length_eq":
        return this.isNumber(expected) && this.length(actual) === expected;

      case "length_gt":
        return this.isNumber(expected) && this.length(actual) > expected;

      case "length_gte":
        return this.isNumber(expected) && this.length(actual) >= expected;

      case "length_lt":
        return this.isNumber(expected) && this.length(actual) < expected;

      case "length_lte":
        return this.isNumber(expected) && this.length(actual) <= expected;

      //
      // Type
      //

      case "type_is":
        return this.isString(expected) && this.typeOf(actual) === expected;

      default: {
        const unsupported: never = operator;

        throw new Error(`Unsupported policy operator: ${unsupported}`);
      }
    }
  }

  /**
   * Deterministic regular expression evaluation.
   *
   * NOTE:
   * Regex syntax should already have been validated
   * by PolicyValidator.
   */
  private matches(actual: string, pattern: string): boolean {
    return new RegExp(pattern).test(actual);
  }

  /**
   * Returns deterministic length.
   */
  private length(value: JsonValue): number {
    if (this.isString(value)) {
      return value.length;
    }

    if (Array.isArray(value)) {
      return value.length;
    }

    if (value !== null && typeof value === "object") {
      return Object.keys(value).length;
    }

    return 0;
  }

  /**
   * Returns canonical JSON type.
   */
  private typeOf(value: JsonValue): string {
    if (value === null) {
      return "null";
    }

    if (Array.isArray(value)) {
      return "array";
    }

    switch (typeof value) {
      case "string":
        return "string";

      case "number":
        return "number";

      case "boolean":
        return "boolean";

      case "object":
        return "object";

      default:
        return "unknown";
    }
  }

  /**
   * Type guard.
   */
  private isNumber(value: JsonValue | undefined): value is number {
    return typeof value === "number";
  }

  /**
   * Type guard.
   */
  private isString(value: JsonValue | undefined): value is string {
    return typeof value === "string";
  }
}
