import type { ApprovalScope } from "@parmana/shared";

/**
 * Evaluates whether an actual, independently-derived value satisfies
 * an ApprovalScope's bound.
 *
 * A small, self-contained implementation of exactly the six
 * comparators §7.1 of the Phase 3A approval artifact design (in
 * git history) restricts ApprovalScope.comparator to (eq, lte, gte, lt, gt,
 * between) -- deliberately not importing @parmana/policy's
 * OperatorEvaluator, which supports a much larger operator set for
 * arbitrary policy conditions and represents "between" as a 2-element
 * array, not the {min, max} object shape Phase 3A's frozen schema
 * specifies for ApprovalScope.value. Reimplementing this narrow,
 * fixed subset by hand avoids both a cross-package dependency
 * (@parmana/approval -> @parmana/policy) an approval-artifact
 * verifier has no other reason to need, and a value-shape mismatch
 * with PolicyEngine's own vocabulary. Semantics are identical to
 * OperatorEvaluator's own eq/lte/gte/lt/gt/between cases wherever
 * the two overlap, confirmed by direct comparison, not by assumption.
 */
export function evaluateApprovalScope(
  actual: unknown,
  scope: Pick<ApprovalScope, "comparator" | "value">,
): boolean {
  const { comparator, value } = scope;

  if (comparator === "eq") {
    return actual === value;
  }

  if (typeof actual !== "number") {
    return false;
  }

  if (comparator === "between") {
    if (
      typeof value !== "object" ||
      value === null ||
      typeof (value as { min?: unknown }).min !== "number" ||
      typeof (value as { max?: unknown }).max !== "number"
    ) {
      return false;
    }

    const { min, max } = value as { min: number; max: number };

    return actual >= min && actual <= max;
  }

  if (typeof value !== "number") {
    return false;
  }

  switch (comparator) {
    case "lte":
      return actual <= value;
    case "gte":
      return actual >= value;
    case "lt":
      return actual < value;
    case "gt":
      return actual > value;
    default:
      return false;
  }
}
