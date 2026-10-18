import { describe, expect, it } from "vitest";

import { SignalIntentBinder } from "../../src/SignalIntentBinder.js";
import type { Policy } from "../../src/types/Policy.js";

/**
 * Found by adversarial testing: PolicyEngine evaluates caller-declared
 * signals, while ExecutionGateway signs and executes intent.target /
 * intent.parameters — a disjoint set of fields nothing cross-checked.
 * Live PoC: signals described a verified $5,000 payment to a known
 * vendor while intent executed a $999,999,999 transfer to an
 * attacker-controlled account; both were approved, signed, and
 * executed. This is the regression test proving that exact shape of
 * mismatch is now caught, using the same field names as the live PoC.
 */
describe("SignalIntentBinder", () => {
  const policyWithBindings: Policy = {
    policyId: "vendor-payment",
    policyVersion: "2.0.0",
    schemaVersion: "1.0.0",
    boundSignals: {
      paymentAmount: "parameters.amount",
      vendorId: "target",
    },
    rules: [
      {
        id: "approve",
        condition: { always: true },
        outcome: { action: "approve" as never, reason: "always approves" },
      },
    ],
  };

  it("reports no violations when a policy declares no boundSignals", () => {
    const binder = new SignalIntentBinder();

    const policyWithoutBindings: Policy = {
      ...policyWithBindings,
      boundSignals: undefined,
    };

    const violations = binder.findViolations(
      policyWithoutBindings,
      { paymentAmount: 999999999, vendorId: "ATTACKER" },
      { target: "SOMEONE-ELSE", parameters: { amount: 1 } },
    );

    expect(violations).toEqual([]);
  });

  it("reports no violations when every bound signal matches the intent", () => {
    const binder = new SignalIntentBinder();

    const violations = binder.findViolations(
      policyWithBindings,
      { paymentAmount: 5000, vendorId: "VENDOR-1001" },
      { target: "VENDOR-1001", parameters: { amount: 5000 } },
    );

    expect(violations).toEqual([]);
  });

  it("blocks the exact live exploit: signals describe a small verified payment, intent executes a different amount to a different target", () => {
    const binder = new SignalIntentBinder();

    const violations = binder.findViolations(
      policyWithBindings,
      // Caller-declared signals: a small, fully-verified $5,000
      // payment to a known vendor.
      { paymentAmount: 5000, vendorId: "VENDOR-1001" },
      // What Intent actually executes: $999,999,999 to an
      // attacker-controlled account.
      {
        target: "ATTACKER-CONTROLLED-ACCOUNT-9999",
        parameters: { amount: 999999999 },
      },
    );

    expect(violations).toHaveLength(2);

    expect(violations).toContainEqual({
      signalKey: "paymentAmount",
      intentPath: "parameters.amount",
      signalValue: 5000,
      intentValue: 999999999,
    });

    expect(violations).toContainEqual({
      signalKey: "vendorId",
      intentPath: "target",
      signalValue: "VENDOR-1001",
      intentValue: "ATTACKER-CONTROLLED-ACCOUNT-9999",
    });
  });

  it("treats a missing bound signal as a violation rather than a pass", () => {
    const binder = new SignalIntentBinder();

    const violations = binder.findViolations(
      policyWithBindings,
      { paymentAmount: 5000 }, // vendorId omitted entirely
      { target: "VENDOR-1001", parameters: { amount: 5000 } },
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].signalKey).toBe("vendorId");
    expect(violations[0].signalValue).toBeUndefined();
  });

  it("resolves nested dot-paths against parameters", () => {
    const binder = new SignalIntentBinder();

    const nestedPolicy: Policy = {
      ...policyWithBindings,
      boundSignals: { requestedRefundAmountPaise: "parameters.amountPaise" },
    };

    const matching = binder.findViolations(
      nestedPolicy,
      { requestedRefundAmountPaise: 100000 },
      { target: "payments/pay_1/refund", parameters: { amountPaise: 100000 } },
    );

    expect(matching).toEqual([]);

    const mismatching = binder.findViolations(
      nestedPolicy,
      { requestedRefundAmountPaise: 100000 },
      { target: "payments/pay_1/refund", parameters: { amountPaise: 9900000 } },
    );

    expect(mismatching).toHaveLength(1);
  });

  // Found by mutation testing: a path that passes through a value that is
  // not an object was untested. It must resolve to nothing (a violation),
  // never read a property of a string or throw on null.
  it("does not read through a string or null on the way to a bound value", () => {
    const binder = new SignalIntentBinder();
    const policy: Policy = {
      ...policyWithBindings,
      boundSignals: { declared: "parameters.order.length" },
    };

    // "abcd".length is 4: following the path into the string would make
    // a declared 4 look bound to the Intent.
    const throughString = binder.findViolations(
      policy,
      { declared: 4 },
      { target: "t", parameters: { order: "abcd" } },
    );
    expect(throughString).toHaveLength(1);
    expect(throughString[0]!.intentValue).toBeUndefined();

    const throughNull = binder.findViolations(
      policy,
      { declared: 4 },
      { target: "t", parameters: { order: null } },
    );
    expect(throughNull).toHaveLength(1);
    expect(throughNull[0]!.intentValue).toBeUndefined();
  });
});
