import type { PolicyReference } from "@parmana/shared";

/**
 * One violation of the capability/policy binding: the caller declared
 * a policy reference other than the one bound to this capability, or
 * the version in effect could not be established.
 */
export interface CapabilityPolicyBindingViolation {
  readonly action: string;
  readonly expected: PolicyReference;
  readonly declared: PolicyReference;

  /**
   * Set when no version in effect could be established for the bound
   * policy name (none approved, or the lookup failed). The request is
   * refused either way; this says why.
   */
  readonly reason?: string;
}

/**
 * Where the version in effect for a bound policy name comes from when
 * policy governance decides it (G-66): the version with the most recent
 * approval record for that name. Returns undefined when no version of
 * the name was ever approved. Throws when it cannot tell.
 */
export interface CurrentPolicyVersionSource {
  currentVersion(policyName: string): Promise<string | undefined>;
}

/**
 * Capabilities bound to a policy by an external connector registration
 * (ADR-0013) instead of by CANONICAL_CAPABILITY_POLICY_BINDINGS: the
 * policy name the active registration for a capability names, or
 * undefined when the capability has none. Throws when it cannot tell.
 */
export interface ExternalPolicyBindingSource {
  policyFor(capability: string): Promise<string | undefined>;
}

/**
 * The policy schema version every policy in this repository declares.
 * A registration names only the policy; this completes the reference.
 */
const EXTERNAL_BINDING_SCHEMA_VERSION = "1.0.0";

/**
 * The single authoritative mapping from a production capability
 * (`Intent.action`) to the one policy that governs it.
 *
 * Every entry here corresponds to a capability actually registered in
 * production bootstrap (`packages/api/src/bootstrap/createConnectorRegistry.ts`)
 * and the one policy file already purpose-built to authorize it
 * (`policies/<name>/<version>/policy.json`).
 *
 * The policy NAME is fixed here and changes only with a deploy. The
 * VERSION here is used only where policy governance does not decide it
 * (NODE_ENV test and development, see CapabilityPolicyBinder). Where it
 * does, production included, the version in effect is the one most
 * recently approved through policy governance (G-66), so a new version
 * goes live when it is approved, with no deploy. Actions with no entry here
 * (every test/tutorial/example fixture action, and any future capability
 * not yet given a canonical policy) are entirely unaffected by
 * `CapabilityPolicyBinder` -- this table is additive, not a replacement
 * for `PolicyRouter`/`PolicyEngine`, and does not change how a policy,
 * once selected, is loaded or evaluated.
 *
 * Lives in its own package (`@parmana/capability-registry`), not
 * `@parmana/policy`, specifically so that a package which needs to know
 * "is this capability bound, and to what" -- including, eventually,
 * `packages/api`'s own connector-registration bootstrap -- can depend on
 * this map without depending on all of `@parmana/policy` (`PolicyEngine`,
 * `SignalIntentBinder`, etc.), and so `@parmana/policy` itself can depend
 * on this map without creating a cycle back through any connector package.
 * `@parmana/connector-hubspot` (directly) and `@parmana/connector-github`
 * (via `@parmana/connector-sdk`) both already depend on `@parmana/policy`,
 * so this package deliberately depends on nothing except `@parmana/shared`
 * -- not on either connector package -- to keep it a true leaf. See
 * `docs/VERIFICATION-GAPS.md` G-30 for the full history of why this extraction happened and
 * what it does and doesn't close.
 */
export const CANONICAL_CAPABILITY_POLICY_BINDINGS: ReadonlyMap<
  string,
  PolicyReference
> = new Map([
  //
  // Every capability needs a signed human approval, reads included
  // (PolicyValidator.validateEveryApprovalNeedsSignedApproval). A read
  // keeps its own policy so its approval is scoped to what it reads.
  //
  [
    "hubspot:deal-fetch",
    { name: "hubspot-deal-read", version: "1.0.0", schemaVersion: "1.0.0" },
  ],
  [
    "hubspot:deal-update",
    { name: "hubspot-deal-update", version: "1.1.0", schemaVersion: "1.0.0" },
  ],
  [
    "github:pr-fetch",
    { name: "github-pr-read", version: "1.1.0", schemaVersion: "1.0.0" },
  ],
  [
    "github:pr-merge",
    { name: "github-pr-approval", version: "1.1.0", schemaVersion: "1.0.0" },
  ],
  [
    "paytm:refund",
    // G-75: 1.2.0 needs a signed manager approval for every refund.
    { name: "customer-refund", version: "1.2.0", schemaVersion: "1.0.0" },
  ],
  [
    "slack:post-message",
    { name: "slack-post-message", version: "1.1.0", schemaVersion: "1.0.0" },
  ],
]);

/**
 * Capability/Policy Binder.
 *
 * A capability whose `boundSignals`/`SignalStateVerifier` protections
 * are scoped to one specific policy is only actually protected by them
 * when that specific policy is the one evaluated. Nothing upstream of
 * this class enforces that: `PolicyRouter`/`FilePolicyRepository` load
 * whatever `policy.name`/`policy.version` the caller declares,
 * `PolicyEngine.evaluate` takes no `action` parameter at all, and
 * `DefaultConnectorPolicy.assertAllowed` checks only that the resolved
 * connector declares the capability, never which policy authorized it.
 * A caller could therefore pair a real capability (e.g.
 * `hubspot:deal-update`) with an unrelated, unprotected policy that
 * has no `boundSignals` for it, evaluate that policy's own (looser)
 * rules against self-declared signals, and have the real, unrelated
 * `intent.parameters` executed -- bypassing the capability's intended
 * protections entirely, not merely weakening them.
 *
 * This class closes that gap structurally: for any capability present
 * in `CANONICAL_CAPABILITY_POLICY_BINDINGS`, the declared policy
 * reference MUST equal the canonical one, or the request is rejected
 * before a policy file is even evaluated against it. Capabilities with
 * no canonical entry are unaffected -- caller-declared policy selection
 * for those is unchanged.
 */
export class CapabilityPolicyBinder {
  /**
   * With currentVersions, the declared version must equal the version
   * in effect for the bound name, as policy governance decides it: an
   * older version, even one approved in the past, is refused, and so is
   * any request when none is approved or the lookup fails. Without it,
   * the declared version must equal the version in the binding above.
   */
  constructor(
    private readonly currentVersions?: CurrentPolicyVersionSource,
    /**
     * Capabilities registered as external connectors (ADR-0013). Checked
     * only for a capability with no canonical entry. Their version in
     * effect is always decided by policy governance: without
     * currentVersions, every request for one is refused.
     */
    private readonly externalBindings?: ExternalPolicyBindingSource,
  ) {}

  /**
   * Returns the binding violation for this action/declared-policy pair,
   * or undefined when there is nothing to enforce (no canonical entry
   * for this action) or the declared policy already matches it.
   */
  public async findViolation(
    action: string,
    declared: PolicyReference,
  ): Promise<CapabilityPolicyBindingViolation | undefined> {
    const inEffect = await this.policyInEffect(action);

    if (inEffect === undefined) {
      return undefined;
    }

    if (inEffect.kind === "unavailable") {
      return {
        action,
        expected: inEffect.bound,
        declared,
        reason: inEffect.reason,
      };
    }

    const expected = inEffect.policy;

    return expected.name === declared.name &&
      expected.version === declared.version
      ? undefined
      : { action, expected, declared };
  }

  /**
   * The policy a request for this action must declare right now, by the
   * same rule findViolation enforces, so an agent can ask for it instead
   * of writing a version into its code. Undefined when the action has no
   * canonical entry (nothing is enforced for it).
   */
  public async policyInEffect(
    action: string,
  ): Promise<PolicyInEffect | undefined> {
    const canonical = CANONICAL_CAPABILITY_POLICY_BINDINGS.get(action);

    if (canonical === undefined) {
      return this.externalPolicyInEffect(action);
    }

    if (this.currentVersions === undefined) {
      return { kind: "in-effect", policy: canonical };
    }

    return this.governedVersion(action, canonical, this.currentVersions);
  }

  private async externalPolicyInEffect(
    action: string,
  ): Promise<PolicyInEffect | undefined> {
    if (this.externalBindings === undefined) {
      return undefined;
    }

    let policyName: string | undefined;

    try {
      policyName = await this.externalBindings.policyFor(action);
    } catch (error) {
      return {
        kind: "unavailable",
        bound: { name: "", version: "", schemaVersion: "" },
        noApprovedVersion: false,
        reason:
          `whether capability "${action}" is registered as an external connector ` +
          `could not be looked up: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (policyName === undefined) {
      return undefined;
    }

    const bound: PolicyReference = {
      name: policyName,
      version: "",
      schemaVersion: EXTERNAL_BINDING_SCHEMA_VERSION,
    };

    if (this.currentVersions === undefined) {
      return {
        kind: "unavailable",
        bound,
        noApprovedVersion: false,
        reason:
          `capability "${action}" is an external connector, whose policy version is decided ` +
          "only by policy governance, which is not enabled here",
      };
    }

    return this.governedVersion(action, bound, this.currentVersions);
  }

  private async governedVersion(
    action: string,
    bound: PolicyReference,
    currentVersions: CurrentPolicyVersionSource,
  ): Promise<PolicyInEffect> {
    let currentVersion: string | undefined;

    try {
      currentVersion = await currentVersions.currentVersion(bound.name);
    } catch (error) {
      return {
        kind: "unavailable",
        bound,
        noApprovedVersion: false,
        reason:
          `the version of policy "${bound.name}" in effect for capability "${action}" ` +
          `could not be looked up: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (currentVersion === undefined) {
      return {
        kind: "unavailable",
        bound,
        noApprovedVersion: true,
        reason:
          `no version of policy "${bound.name}", which capability "${action}" requires, ` +
          "has been approved through policy governance",
      };
    }

    return { kind: "in-effect", policy: { ...bound, version: currentVersion } };
  }
}

/**
 * The result of CapabilityPolicyBinder.policyInEffect for a bound
 * action: the policy to declare, or why none can be accepted right now
 * (no version approved, or the lookup failed), in which case every
 * request for the action is refused.
 */
export type PolicyInEffect =
  | { readonly kind: "in-effect"; readonly policy: PolicyReference }
  | {
      readonly kind: "unavailable";
      readonly bound: PolicyReference;
      readonly noApprovedVersion: boolean;
      readonly reason: string;
    };
