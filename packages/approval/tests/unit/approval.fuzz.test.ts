import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { ApprovalScope } from "@parmana/shared";

import { evaluateApprovalScope } from "../../src/ApprovalScopeEvaluator.js";
import { isSignedApprovalShape } from "../../src/SignedApprovalGuard.js";

/**
 * Fuzzing what reads an approval an agent sends: the shape guard and
 * the scope comparison take arbitrary JSON and answer a boolean,
 * never throw, and a scope bound that is not a number never covers
 * anything.
 */

describe("approval fuzzing", () => {
  it("the shape guard answers a boolean for any value", () => {
    fc.assert(
      fc.property(fc.jsonValue({ maxDepth: 4 }), (value) => {
        expect(typeof isSignedApprovalShape(value)).toBe("boolean");
      }),
      { numRuns: 2000 },
    );
  });

  it("the scope comparison answers a boolean, and a non-number bound covers nothing", () => {
    fc.assert(
      fc.property(
        fc.jsonValue({ maxDepth: 1 }),
        fc.constantFrom("eq", "lte", "lt", "gte", "gt", "between", "ne"),
        fc.jsonValue({ maxDepth: 1 }),
        (actual, comparator, value) => {
          const covered = evaluateApprovalScope(actual, {
            comparator,
            value,
          } as unknown as ApprovalScope);
          expect(typeof covered).toBe("boolean");
          if (
            comparator !== "eq" &&
            comparator !== "between" &&
            typeof value !== "number"
          ) {
            expect(covered).toBe(false);
          }
        },
      ),
      { numRuns: 2000 },
    );
  });
});
