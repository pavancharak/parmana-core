import { describe, expect, it } from "vitest";

import {
  CapabilityPolicyBinder,
  type CurrentPolicyVersionSource,
  type ExternalPolicyBindingSource,
} from "../../src/index.js";

/**
 * Capabilities bound by an external connector registration (ADR-0013):
 * the registration names the policy, policy governance decides its
 * version, and anything it cannot decide refuses the request.
 */

const governance: CurrentPolicyVersionSource = {
  async currentVersion(name) {
    return name === "erp-invoice" ? "1.2.0" : undefined;
  },
};

function registrations(
  entries: Record<string, string>,
): ExternalPolicyBindingSource {
  return {
    async policyFor(capability) {
      return entries[capability];
    },
  };
}

describe("CapabilityPolicyBinder with external connector registrations", () => {
  it("binds a registered capability to its registration's policy, at the version governance approved", async () => {
    const binder = new CapabilityPolicyBinder(
      governance,
      registrations({ "erp:create-invoice": "erp-invoice" }),
    );

    expect(await binder.policyInEffect("erp:create-invoice")).toEqual({
      kind: "in-effect",
      policy: { name: "erp-invoice", version: "1.2.0", schemaVersion: "1.0.0" },
    });

    expect(
      await binder.findViolation("erp:create-invoice", {
        name: "erp-invoice",
        version: "1.2.0",
        schemaVersion: "1.0.0",
      }),
    ).toBeUndefined();
  });

  it("refuses another policy, or an older version, for a registered capability", async () => {
    const binder = new CapabilityPolicyBinder(
      governance,
      registrations({ "erp:create-invoice": "erp-invoice" }),
    );

    for (const declared of [
      { name: "llm-tool-call", version: "1.1.0", schemaVersion: "1.0.0" },
      { name: "erp-invoice", version: "1.1.0", schemaVersion: "1.0.0" },
    ]) {
      expect(
        await binder.findViolation("erp:create-invoice", declared),
      ).toMatchObject({ action: "erp:create-invoice", declared });
    }
  });

  it("refuses every request when no version of the registration's policy was approved", async () => {
    const binder = new CapabilityPolicyBinder(
      governance,
      registrations({ "crm:create-lead": "crm-lead" }),
    );

    expect(await binder.policyInEffect("crm:create-lead")).toMatchObject({
      kind: "unavailable",
      noApprovedVersion: true,
    });
    expect(
      await binder.findViolation("crm:create-lead", {
        name: "crm-lead",
        version: "1.0.0",
        schemaVersion: "1.0.0",
      }),
    ).toMatchObject({ reason: expect.stringMatching(/has been approved/) });
  });

  it("refuses every request where policy governance does not decide versions", async () => {
    const binder = new CapabilityPolicyBinder(
      undefined,
      registrations({ "erp:create-invoice": "erp-invoice" }),
    );

    expect(await binder.policyInEffect("erp:create-invoice")).toMatchObject({
      kind: "unavailable",
      noApprovedVersion: false,
      reason: expect.stringMatching(/decided only by policy governance/),
    });
    expect(
      await binder.findViolation("erp:create-invoice", {
        name: "erp-invoice",
        version: "1.2.0",
        schemaVersion: "1.0.0",
      }),
    ).toBeDefined();
  });

  it("refuses when the registration cannot be read", async () => {
    const binder = new CapabilityPolicyBinder(governance, {
      async policyFor() {
        throw new Error("storage unreachable");
      },
    });

    expect(await binder.policyInEffect("erp:create-invoice")).toMatchObject({
      kind: "unavailable",
      noApprovedVersion: false,
      reason: expect.stringMatching(/storage unreachable/),
    });
  });

  it("keeps the canonical binding for a built in capability, whatever a registration says", async () => {
    const binder = new CapabilityPolicyBinder(
      governance,
      registrations({ "paytm:refund": "erp-invoice" }),
    );

    expect(await binder.policyInEffect("paytm:refund")).toMatchObject({
      kind: "unavailable",
      bound: { name: "customer-refund" },
    });
  });

  it("leaves a capability that is neither canonical nor registered unbound, as before", async () => {
    const binder = new CapabilityPolicyBinder(governance, registrations({}));

    expect(await binder.policyInEffect("erp:void-invoice")).toBeUndefined();
  });
});
