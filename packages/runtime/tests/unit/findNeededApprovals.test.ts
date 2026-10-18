import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PolicyEngine, type Policy } from "@parmana/policy";

import { findNeededApprovals } from "../../src/ApprovalNeededNotifier.js";

const refundPolicy = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "policies",
      "customer-refund",
      "1.2.0",
      "policy.json",
    ),
    "utf8",
  ),
) as Policy;

const intent = {
  target: "paytm://orders/ORD-9",
  parameters: { orderId: "ORD-9", amount: 750, transactionId: "t-9" },
};

const engine = new PolicyEngine();

const signals = {
  refundEligible: true,
  fraudCheckPassed: true,
  refundAmount: 750,
  managerApproved: false,
};

describe("findNeededApprovals", () => {
  it("names the approval when it is all that is missing", () => {
    expect(findNeededApprovals(engine, refundPolicy, signals, intent)).toEqual([
      { signal: "managerApproved", resourceId: "ORD-9", value: 750 },
    ]);
  });

  it("is undefined when another rule refuses the request", () => {
    expect(
      findNeededApprovals(
        engine,
        refundPolicy,
        { ...signals, fraudCheckPassed: false },
        intent,
      ),
    ).toBeUndefined();
  });

  it("is undefined for a policy with no approvalSignals", () => {
    const { approvalSignals: _ignored, ...withoutApprovals } = refundPolicy;

    expect(
      findNeededApprovals(engine, withoutApprovals, signals, intent),
    ).toBeUndefined();
  });

  it("leaves out what the Intent does not have in the declared form", () => {
    expect(
      findNeededApprovals(engine, refundPolicy, signals, {
        target: intent.target,
        parameters: { amount: "750" },
      }),
    ).toEqual([{ signal: "managerApproved", resourceId: undefined }]);
  });
});
