import { describe, expect, it } from "vitest";

import {
  CANONICAL_CAPABILITY_POLICY_BINDINGS,
  CapabilityPolicyBinder,
  type CurrentPolicyVersionSource,
} from "../../src/CapabilityPolicyBinding.js";
import type { PolicyReference } from "@parmana/shared";

/**
 * Found by an independent repository verification (Phase 2K, TD-22):
 * nothing bound a capability to the one policy that authorizes it.
 * boundSignals/SignalStateVerifier protections are declared per-policy
 * and per-action respectively, so a caller could pair a real capability
 * (e.g. fixture:write) with an unrelated, unprotected policy
 * (e.g. vendor-payment/2.0.0, which declares no boundSignals for it)
 * and bypass those protections entirely, since PolicyEngine.evaluate
 * takes no action parameter and nothing else cross-checks policy
 * identity against capability identity. This is the regression suite
 * proving that gap is now closed.
 *
 * Moved here from packages/policy/tests/unit (G-30 architecture follow-up,
 * Option C: docs/internal/VERIFICATION-GAPS.md G-30)
 * when CapabilityPolicyBinding.ts itself moved into its own package,
 * @parmana/capability-registry, specifically so a future consumer that
 * needs to know "is this capability bound, and to what" doesn't have to
 * depend on all of @parmana/policy to find out.
 */
const FIXTURE_BINDINGS: ReadonlyMap<string, PolicyReference> = new Map([
  [
    "fixture:read",
    { name: "fixture-read", version: "1.1.0", schemaVersion: "1.0.0" },
  ],
  [
    "fixture:write",
    { name: "fixture-write", version: "1.1.0", schemaVersion: "1.0.0" },
  ],
]);

function makeBinder(
  currentVersions?: ConstructorParameters<typeof CapabilityPolicyBinder>[0],
  externalBindings?: ConstructorParameters<typeof CapabilityPolicyBinder>[1],
): CapabilityPolicyBinder {
  return new CapabilityPolicyBinder(
    currentVersions,
    externalBindings,
    FIXTURE_BINDINGS,
  );
}

describe("CapabilityPolicyBinder", () => {
  it("reports no violation for an action with no canonical binding (every test/tutorial action)", async () => {
    const binder = makeBinder();

    const violation = await binder.findViolation("PAY", {
      name: "payment-approval",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    });

    expect(violation).toBeUndefined();
  });

  it("reports no violation when the declared policy matches the canonical binding", async () => {
    const binder = makeBinder();

    const violation = await binder.findViolation("fixture:write", {
      name: "fixture-write",
      version: "1.1.0",
      schemaVersion: "1.0.0",
    });

    expect(violation).toBeUndefined();
  });

  it("blocks the exact live-shaped exploit: a real capability paired with an unrelated, unprotected policy", async () => {
    const binder = makeBinder();

    // A data-mutating capability paired with an unrelated policy:
    // fixture:write
    // (a data-mutating capability whose protections are scoped to
    // fixture-write's own policy) paired
    // with vendor-payment/2.0.0, a real, loadable policy that declares
    // no boundSignals for it.
    const declared: PolicyReference = {
      name: "vendor-payment",
      version: "2.0.0",
      schemaVersion: "1.0.0",
    };

    const violation = await binder.findViolation("fixture:write", declared);

    expect(violation).toEqual({
      action: "fixture:write",
      expected: {
        name: "fixture-write",
        version: "1.1.0",
        schemaVersion: "1.0.0",
      },
      declared,
    });
  });

  it("blocks the same shape of substitution for fixture:read", async () => {
    const binder = makeBinder();

    const violation = await binder.findViolation("fixture:read", {
      name: "fixture-write",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    });

    expect(violation?.expected).toEqual({
      name: "fixture-read",
      version: "1.1.0",
      schemaVersion: "1.0.0",
    });
  });

  it("reports a violation for a version mismatch even when the policy name matches", async () => {
    const binder = makeBinder();

    const violation = await binder.findViolation("fixture:write", {
      name: "fixture-write",
      version: "9.9.9",
      schemaVersion: "1.0.0",
    });

    expect(violation).toBeDefined();
  });

  it("has exactly one canonical policy per bound capability", async () => {
    const seenActions = new Set<string>();

    for (const action of CANONICAL_CAPABILITY_POLICY_BINDINGS.keys()) {
      expect(seenActions.has(action)).toBe(false);
      seenActions.add(action);
    }

    expect(CANONICAL_CAPABILITY_POLICY_BINDINGS.size).toBe(seenActions.size);
  });

  it("binds no capability in this version, because every built in connector has moved out of core", () => {
    expect(CANONICAL_CAPABILITY_POLICY_BINDINGS.size).toBe(0);
  });

  describe("with the version taken from policy governance (G-66)", () => {
    function source(
      versions: Record<string, string | undefined>,
    ): CurrentPolicyVersionSource & { calls: string[] } {
      const calls: string[] = [];
      return {
        calls,
        async currentVersion(policyName: string) {
          calls.push(policyName);
          return versions[policyName];
        },
      };
    }

    const refund = (version: string): PolicyReference => ({
      name: "fixture-write",
      version,
      schemaVersion: "1.0.0",
    });

    it("accepts the approved version, even when the binding in code names another", async () => {
      const binder = makeBinder(source({ "fixture-write": "1.2.0" }));

      expect(
        await binder.findViolation("fixture:write", refund("1.2.0")),
      ).toBeUndefined();
    });

    it("refuses the version written in code when governance has approved another", async () => {
      const binder = makeBinder(source({ "fixture-write": "1.2.0" }));

      expect(
        await binder.findViolation("fixture:write", refund("1.1.0")),
      ).toEqual({
        action: "fixture:write",
        expected: refund("1.2.0"),
        declared: refund("1.1.0"),
      });
    });

    it("refuses an older version that was approved in the past", async () => {
      const binder = makeBinder(source({ "fixture-write": "1.1.0" }));

      expect(
        await binder.findViolation("fixture:write", refund("1.0.0")),
      ).toBeDefined();
    });

    it("still refuses another policy name, whatever its version", async () => {
      const binder = makeBinder(source({ "fixture-write": "1.1.0" }));

      const violation = await binder.findViolation("fixture:write", {
        name: "slack-post-message",
        version: "1.1.0",
        schemaVersion: "1.0.0",
      });

      expect(violation?.expected.name).toBe("fixture-write");
    });

    it("looks up the bound name, never the declared one", async () => {
      const versions = source({
        "fixture-write": "1.1.0",
        "slack-post-message": "1.0.0",
      });
      const binder = makeBinder(versions);

      await binder.findViolation("fixture:write", {
        name: "slack-post-message",
        version: "1.0.0",
        schemaVersion: "1.0.0",
      });

      expect(versions.calls).toEqual(["fixture-write"]);
    });

    it("refuses when no version was ever approved, and says so", async () => {
      const binder = makeBinder(source({}));

      const violation = await binder.findViolation(
        "fixture:write",
        refund("1.1.0"),
      );

      expect(violation?.reason).toContain("has been approved");
    });

    it("refuses when the lookup fails, and says so", async () => {
      const binder = makeBinder({
        async currentVersion() {
          throw new Error("database unreachable");
        },
      });

      const violation = await binder.findViolation(
        "fixture:write",
        refund("1.1.0"),
      );

      expect(violation?.reason).toContain("database unreachable");
    });

    it("does not look anything up for an unbound action", async () => {
      const versions = source({});
      const binder = makeBinder(versions);

      expect(
        await binder.findViolation("PAY", refund("1.0.0")),
      ).toBeUndefined();
      expect(versions.calls).toEqual([]);
    });
  });

  describe("policyInEffect (what an agent should declare)", () => {
    const refund = (version: string): PolicyReference => ({
      name: "fixture-write",
      version,
      schemaVersion: "1.0.0",
    });

    it("is the approved version where governance decides it", async () => {
      const binder = makeBinder({
        async currentVersion() {
          return "1.2.0";
        },
      });

      expect(await binder.policyInEffect("fixture:write")).toEqual({
        kind: "in-effect",
        policy: refund("1.2.0"),
      });
    });

    it("is accepted by findViolation, and nothing else is", async () => {
      const binder = makeBinder({
        async currentVersion() {
          return "1.2.0";
        },
      });

      const inEffect = await binder.policyInEffect("fixture:write");
      if (inEffect?.kind !== "in-effect") throw new Error("expected a policy");

      expect(
        await binder.findViolation("fixture:write", inEffect.policy),
      ).toBeUndefined();
      expect(
        await binder.findViolation("fixture:write", refund("1.1.0")),
      ).toBeDefined();
    });

    it("is the binding in code where governance does not decide it", async () => {
      expect(await makeBinder().policyInEffect("fixture:write")).toEqual({
        kind: "in-effect",
        policy: FIXTURE_BINDINGS.get("fixture:write"),
      });
    });

    it("is unavailable, saying so, when no version was approved", async () => {
      const binder = makeBinder({
        async currentVersion() {
          return undefined;
        },
      });

      const inEffect = await binder.policyInEffect("fixture:write");

      expect(inEffect?.kind).toBe("unavailable");
      expect(inEffect).toMatchObject({ noApprovedVersion: true });
    });

    it("is unavailable, not a guess, when the lookup fails", async () => {
      const binder = makeBinder({
        async currentVersion() {
          throw new Error("database unreachable");
        },
      });

      const inEffect = await binder.policyInEffect("fixture:write");

      expect(inEffect).toMatchObject({
        kind: "unavailable",
        noApprovedVersion: false,
      });
      expect(inEffect?.kind === "unavailable" && inEffect.reason).toContain(
        "database unreachable",
      );
    });

    it("is undefined for an action with no canonical binding", async () => {
      expect(await makeBinder().policyInEffect("PAY")).toBeUndefined();
    });
  });
});
