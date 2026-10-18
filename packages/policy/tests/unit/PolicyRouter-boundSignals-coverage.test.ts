import { describe, expect, it } from "vitest";

import { PolicyRouter } from "../../src/PolicyRouter.js";
import { PolicyValidationError } from "../../src/errors/PolicyValidationError.js";
import type { PolicyRepository } from "../../src/PolicyRepository.js";
import type { Policy } from "../../src/types/Policy.js";

/**
 * Gap #2 (part of the same coverage gap as PolicyValidator.test.ts):
 * PolicyRouter.load() is the actual policy-load entry point RuntimeEngine
 * calls, so boundSignals-coverage enforcement must be observable from
 * here, not just from PolicyValidator directly.
 *
 * G-32 [policy-authoring audit, 2026-09-09]: this used to be a
 * console.warn a nobody-reads-load-time-logs left unenforced. It is now
 * fail-closed -- see PolicyValidator.findUncoveredFacts' and validate()'s
 * own doc comments -- so this file tests throw/no-throw, not a warn spy.
 */
class FakePolicyRepository implements PolicyRepository {
  constructor(private readonly policy: Policy) {}

  async load(): Promise<Policy> {
    return this.policy;
  }

  async save(): Promise<void> {
    throw new Error("not implemented");
  }
}

describe("PolicyRouter boundSignals coverage enforcement", () => {
  it("loads cleanly when every rule fact is bound", async () => {
    const router = new PolicyRouter(
      new FakePolicyRepository({
        policyId: "vendor-payment",
        policyVersion: "2.0.0",
        schemaVersion: "1.0.0",
        boundSignals: { amount: "parameters.amount" },
        rules: [
          {
            id: "reject-large",
            condition: { fact: "amount", operator: "gt", value: 500 },
            outcome: { action: "reject" as never, reason: "too large" },
          },
        ],
      }),
    );

    await expect(router.load("vendor-payment", "2.0.0")).resolves.toBeDefined();
  });

  it("loads cleanly when an uncovered fact is explicitly acknowledged in unboundSignalReasons", async () => {
    const router = new PolicyRouter(
      new FakePolicyRepository({
        policyId: "vendor-payment",
        policyVersion: "2.0.0",
        schemaVersion: "1.0.0",
        unboundSignalReasons: {
          amount: "No genuine Intent-side equivalent for this test fixture.",
        },
        rules: [
          {
            id: "reject-large",
            condition: { fact: "amount", operator: "gt", value: 500 },
            outcome: { action: "reject" as never, reason: "too large" },
          },
        ],
      }),
    );

    await expect(router.load("vendor-payment", "2.0.0")).resolves.toBeDefined();
  });

  it("fails closed -- throws naming the policy and the uncovered fact -- when coverage is incomplete and unacknowledged", async () => {
    const router = new PolicyRouter(
      new FakePolicyRepository({
        policyId: "vendor-payment",
        policyVersion: "2.0.0",
        schemaVersion: "1.0.0",
        rules: [
          {
            id: "reject-large",
            condition: { fact: "amount", operator: "gt", value: 500 },
            outcome: { action: "reject" as never, reason: "too large" },
          },
        ],
      }),
    );

    await expect(router.load("vendor-payment", "2.0.0")).rejects.toThrow(
      PolicyValidationError,
    );
    await expect(router.load("vendor-payment", "2.0.0")).rejects.toThrow(
      /'amount'/,
    );
  });
});
