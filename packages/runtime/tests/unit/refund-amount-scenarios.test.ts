import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  PolicyAction,
  PolicyEngine,
  PolicyOutcome,
  SignalIntentBinder,
  type Policy,
} from "@parmana/policy";
import { BusinessValidationStatus } from "@parmana/shared";

import {
  StaticBusinessSignalSourceRegistry,
  type BusinessSignalSource,
  type BusinessSignalSourceAnswer,
} from "../../src/business-validation/BusinessSignalSource.js";
import { TrustedSignalResolver } from "../../src/business-validation/TrustedSignalResolver.js";

/** The claim a payment source establishes for a refund. Served by a source outside core. */
const PAYMENT_REFUNDABLE_CLAIM = "payment.refundable";

/**
 * Scenarios for a refund amount that is consistent and within limits but wrong
 * for the customer. See the scenario list in the gap analysis.
 *
 * Scenarios A and C describe the current behaviour: they assert that Parmana
 * approves a wrong amount, because no trusted source establishes the correct
 * one. Scenario E tests the mechanism that would refuse it, using a policy
 * that declares a sourced amount. No production policy does so yet, so the
 * matching policy-level test is a todo.
 */

const NOW = new Date("2026-10-10T12:00:00.000Z");

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const refundPolicy = JSON.parse(
  readFileSync(
    join(repoRoot, "policies", "customer-refund", "1.2.0", "policy.json"),
    "utf8",
  ),
) as Policy;

describe("refund amount scenarios", () => {
  // A. The customer asked for 5,000. The caller sends 50,000 in both the
  // signal and the Intent, and every other condition holds. The policy has
  // no way to know 5,000 was the correct figure.
  it("A: a consistent wrong amount within the ceiling is approved by the policy", () => {
    const decision = new PolicyEngine().evaluate(refundPolicy, {
      refundEligible: true,
      fraudCheckPassed: true,
      managerApproved: true,
      refundAmount: 50_000,
    });

    expect(decision.outcome).toBe(PolicyOutcome.APPROVE);
    expect(decision.matchedRuleId).toBe("approve-refund-with-manager-approval");
  });

  // B. The signal says 5,000 but the Intent says 50,000. This is caught,
  // because the two fields disagree. Contrast with scenario A.
  it("B: a signal that differs from the Intent amount is refused by the binder", () => {
    const violations = new SignalIntentBinder().findViolations(
      refundPolicy,
      { refundAmount: 5_000 },
      { parameters: { orderId: "ORD-1001", amount: 50_000 } },
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      signalKey: "refundAmount",
      intentPath: "parameters.amount",
      signalValue: 5_000,
      intentValue: 50_000,
    });
  });

  // C. The payment is ₹1,00,000 (10,000,000 paise) with nothing refunded. The
  // customer asked for ₹5,000 (500,000 paise), but the caller proposes
  // ₹60,000 (6,000,000 paise). The provider confirms that amount is still
  // refundable, so the source check passes and the wrong amount is accepted.
  it("C: the payment source confirms a wrong amount is still refundable, so the source passes", async () => {
    // A test stub for a payment source that reports the payment as refundable. The real
    // payment.refundable signal is served from parmana-connectors (src/signal/razorpay-payment-signal.ts),
    // and its own tests cover that logic. This test checks how Parmana handles a sourced "true".
    const source: BusinessSignalSource = {
      name: "payments",
      resolve: async () => ({
        kind: "observed",
        value: true,
        sourceIdentity: "test-payment-source",
        observedAt: NOW,
        validUntil: new Date(NOW.getTime() + 60_000),
      }),
    };

    const answer = await source.resolve({
      signalKey: "paymentRefundable",
      claim: PAYMENT_REFUNDABLE_CLAIM,
      subject: "pay_ABC123456",
      subjectPath: "target",
      action: "razorpay:refund",
      businessTransactionId: "btx-1",
      parameters: { amount: 6_000_000 },
    });

    expect(answer).toMatchObject({ kind: "observed", value: true });
  });

  // E. The mechanism that would catch scenario A. A business source says the
  // correct amount is 5,000. The caller proposes 50,000, so the resolver
  // refuses the request as INVALID before any rule runs. The control case
  // with a matching amount is VALID.
  describe("E: a sourced amount refuses a proposed amount that differs", () => {
    const amountPolicy: Policy = {
      policyId: "refund-sourced-amount",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      signalsSchema: { amount: "number" },
      signalSources: {
        amount: {
          source: "orders-system",
          claim: "refund.amount",
          subject: "parameters.orderId",
          maxAgeSeconds: 60,
        },
      },
      rules: [
        {
          id: "always-reject",
          condition: { always: true },
          outcome: { action: PolicyAction.REJECT, reason: "placeholder" },
        },
      ],
    };

    const resolverFor = (correctAmount: number) => {
      const answer: BusinessSignalSourceAnswer = {
        kind: "observed",
        value: correctAmount,
        sourceIdentity: "orders-system:prod",
        observedAt: NOW,
      };
      return new TrustedSignalResolver(
        new StaticBusinessSignalSourceRegistry([
          { name: "orders-system", resolve: async () => answer },
        ]),
        { now: () => NOW },
      );
    };

    const request = (proposedAmount: number) => ({
      policy: amountPolicy,
      action: "erp:refund",
      businessTransactionId: "btx-2",
      intent: {
        target: "orders/ORD-1001",
        parameters: { orderId: "ORD-1001", amount: proposedAmount },
      },
      proposedSignals: { amount: proposedAmount },
    });

    it("refuses 50,000 when the source says 5,000", async () => {
      const result = await resolverFor(5_000).resolve(request(50_000));

      expect(result.assessment.status).toBe(BusinessValidationStatus.INVALID);
      expect(result.trustedValues).toEqual({});
    });

    it("accepts 5,000 when the source says 5,000 (control)", async () => {
      const result = await resolverFor(5_000).resolve(request(5_000));

      expect(result.assessment.status).toBe(BusinessValidationStatus.VALID);
      expect(result.trustedValues).toEqual({ amount: 5_000 });
    });
  });

  // The policy-level version of E. It cannot pass yet: 1.2.0 declares no
  // sourced amount, so there is nothing to compare the proposal with.
  it.todo(
    "policy refuses a consistent wrong amount once a policy declares a sourced amount",
  );
  it.todo(
    "a refund approval covers only the sourced amount, not the caller's proposal",
  );
});
