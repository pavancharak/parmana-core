import { describe, expect, it } from "vitest";

import { CapabilityPolicyBinder } from "../../src/CapabilityPolicyBinding.js";

/**
 * razorpay:refund is bound to customer-refund in the canonical table. A request
 * for it must declare that policy at the bound version. Any other pairing is a
 * binding violation, so a capability cannot be run under an unrelated policy.
 */
const BOUND = {
  name: "customer-refund",
  version: "1.3.0",
  schemaVersion: "1.0.0",
};

describe("razorpay:refund binding", () => {
  it("accepts the bound policy and version", async () => {
    const binder = new CapabilityPolicyBinder();

    expect(
      await binder.findViolation("razorpay:refund", BOUND),
    ).toBeUndefined();
  });

  it("refuses a different version of the same policy", async () => {
    const binder = new CapabilityPolicyBinder();

    const violation = await binder.findViolation("razorpay:refund", {
      ...BOUND,
      version: "1.2.0",
    });

    expect(violation).toBeDefined();
  });

  it("refuses an unrelated policy", async () => {
    const binder = new CapabilityPolicyBinder();

    const violation = await binder.findViolation("razorpay:refund", {
      name: "agent-vendor-payment",
      version: "1.1.0",
      schemaVersion: "1.0.0",
    });

    expect(violation).toBeDefined();
  });

  it("leaves capabilities with no canonical entry unaffected", async () => {
    const binder = new CapabilityPolicyBinder();

    expect(
      await binder.findViolation("paytm:refund", {
        name: "anything",
        version: "1.0.0",
        schemaVersion: "1.0.0",
      }),
    ).toBeUndefined();
  });
});
