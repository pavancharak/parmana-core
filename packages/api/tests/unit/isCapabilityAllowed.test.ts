import { describe, expect, it } from "vitest";

import { isCapabilityAllowed } from "../../src/auth/isCapabilityAllowed.js";

describe("isCapabilityAllowed", () => {
  it("rejects an undefined action", () => {
    expect(isCapabilityAllowed(undefined, ["razorpay:refund-create"])).toBe(
      false,
    );
  });

  it("rejects an empty action", () => {
    expect(isCapabilityAllowed("", ["razorpay:refund-create"])).toBe(false);
  });

  it("fail-closed default: denies every capability when allowedCapabilities is unset", () => {
    expect(isCapabilityAllowed("razorpay:refund-create", undefined)).toBe(
      false,
    );
  });

  it("fail-closed default: denies every capability when allowedCapabilities is empty", () => {
    expect(isCapabilityAllowed("razorpay:refund-create", [])).toBe(false);
  });

  it("honors an explicit allowedCapabilities grant", () => {
    expect(
      isCapabilityAllowed("razorpay:refund-create", ["razorpay:refund-create"]),
    ).toBe(true);
  });

  it("rejects a capability not present in an explicit allowedCapabilities grant", () => {
    expect(
      isCapabilityAllowed("hubspot:deal-update", ["razorpay:refund-create"]),
    ).toBe(false);
  });

  it("blocks the exact gap this closes: a caller scoped to one capability cannot invoke an unrelated one", () => {
    expect(
      isCapabilityAllowed("hubspot:deal-update", [
        "razorpay:refund-create",
        "razorpay:refund-fetch",
      ]),
    ).toBe(false);
  });

  it('honors the explicit "*" wildcard convention', () => {
    expect(isCapabilityAllowed("razorpay:refund-create", ["*"])).toBe(true);
    expect(isCapabilityAllowed("hubspot:deal-update", ["*"])).toBe(true);
  });

  it('honors "*" alongside other explicit entries', () => {
    expect(
      isCapabilityAllowed("anything:at-all", ["razorpay:refund-create", "*"]),
    ).toBe(true);
  });
});
