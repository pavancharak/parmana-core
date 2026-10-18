import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { PolicyValidationError } from "../../src/errors/PolicyValidationError.js";
import { PolicyEngine } from "../../src/PolicyEngine.js";
import { PolicyValidator } from "../../src/PolicyValidator.js";
import type { Policy } from "../../src/types/Policy.js";
import type { PolicySignals } from "../../src/types/PolicySignals.js";

/**
 * Fuzzing policy loading and evaluation. A policy file is JSON an
 * author writes; signals are JSON an agent sends. Whatever they hold,
 * validation either accepts the policy or refuses it with a
 * PolicyValidationError, and a policy that validates evaluates any
 * signals to APPROVE or REJECT without throwing.
 */

const validator = new PolicyValidator();
const engine = new PolicyEngine();

const OPERATORS = [
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
  "matches",
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
];

const FACTS = ["amount", "region", "flag", "items"];

const leaf = fc.record({
  fact: fc.constantFrom(...FACTS),
  operator: fc.oneof(fc.constantFrom(...OPERATORS), fc.string()),
  value: fc.jsonValue({ maxDepth: 1 }),
});

const condition: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  node: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    leaf,
    fc.constant({ always: true }),
    fc.record({ all: fc.array(tie("node"), { maxLength: 3 }) }),
    fc.record({ any: fc.array(tie("node"), { maxLength: 3 }) }),
    fc.jsonValue({ maxDepth: 1 }),
  ),
})).node;

const rule = fc.record({
  id: fc.string({ minLength: 0, maxLength: 6 }),
  condition,
  outcome: fc.record({
    action: fc.constantFrom("approve", "reject", "escalate", ""),
    reason: fc.string({ maxLength: 8 }),
  }),
});

const policyLike = fc.record(
  {
    policyId: fc.oneof(fc.constant("p"), fc.jsonValue({ maxDepth: 0 })),
    policyVersion: fc.oneof(
      fc.constant("1.0.0"),
      fc.jsonValue({ maxDepth: 0 }),
    ),
    schemaVersion: fc.constant("1.0.0"),
    signalsSchema: fc.oneof(
      fc.dictionary(
        fc.constantFrom(...FACTS),
        fc.constantFrom("boolean", "number", "string", "integer"),
      ),
      fc.jsonValue({ maxDepth: 1 }),
    ),
    unboundSignalReasons: fc.constant(
      Object.fromEntries(FACTS.map((fact) => [fact, "Checked elsewhere."])),
    ),
    rules: fc.oneof(
      fc.array(rule, { minLength: 1, maxLength: 4 }),
      fc.jsonValue({ maxDepth: 1 }),
    ),
  },
  { requiredKeys: ["policyId", "policyVersion", "schemaVersion", "rules"] },
);

const signals = fc.dictionary(
  fc.constantFrom(...FACTS, "other"),
  fc.jsonValue({ maxDepth: 2 }),
);

describe("policy fuzzing", () => {
  it("validation accepts a policy or refuses it with PolicyValidationError, nothing else", () => {
    fc.assert(
      fc.property(policyLike, (candidate) => {
        try {
          validator.validate(candidate as unknown as Policy);
        } catch (error) {
          expect(error, String(error)).toBeInstanceOf(PolicyValidationError);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("a policy that validates evaluates any signals to APPROVE or REJECT", () => {
    fc.assert(
      fc.property(
        policyLike,
        fc.array(signals, { maxLength: 5 }),
        (candidate, cases) => {
          try {
            validator.validate(candidate as unknown as Policy);
          } catch {
            return;
          }
          for (const input of cases) {
            const decision = engine.evaluate(
              candidate as unknown as Policy,
              input as PolicySignals,
            );
            expect(["APPROVE", "REJECT"]).toContain(decision.outcome);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("validation and evaluation are deterministic", () => {
    fc.assert(
      fc.property(policyLike, signals, (candidate, input) => {
        const run = () => {
          try {
            validator.validate(candidate as unknown as Policy);
            return engine.evaluate(
              candidate as unknown as Policy,
              input as PolicySignals,
            );
          } catch (error) {
            return String(error);
          }
        };
        expect(run()).toEqual(run());
      }),
      { numRuns: 300 },
    );
  });
});
