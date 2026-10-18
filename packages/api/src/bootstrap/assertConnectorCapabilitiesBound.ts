import { CANONICAL_CAPABILITY_POLICY_BINDINGS } from "@parmana/policy";
import type { ConnectorCapabilities } from "@parmana/connector-sdk";

import { INTENTIONALLY_UNBOUND_CAPABILITIES } from "./intentionallyUnboundCapabilities.js";

/**
 * The subset of GatewayConnectorRegistration (@parmana/execution-gateway)
 * this assertion actually needs. Kept narrow and structural, rather than
 * importing the full registration type, so a unit test can build a
 * fixture without constructing an entire connector/policy/credential
 * stack.
 */
export interface CapabilityBoundConnectorRegistration {
  readonly connectorIdentity: {
    readonly connectorId: string;
  };
  readonly connector: {
    readonly capabilities: ConnectorCapabilities;
  };
}

/**
 * Fail-closed startup guardrail: every capability actually registered by
 * a connector must either have a canonical capability/policy binding
 * (CANONICAL_CAPABILITY_POLICY_BINDINGS, @parmana/policy) or be listed,
 * with a reason, in INTENTIONALLY_UNBOUND_CAPABILITIES.
 *
 * Why this exists: CapabilityPolicyBinder only protects capabilities it
 * knows about — an action with no canonical entry is silently
 * unaffected by it (see CapabilityPolicyBinding.ts's own doc comment in
 * @parmana/capability-registry). Today every capability actually
 * registered in production (hubspot:*, github:*, paytm:refund) already has a binding,
 * so this assertion currently never fires outside test-fixture's own
 * exemption below — its purpose is making sure the NEXT connector added
 * can't silently ship the same gap.
 *
 * Called from createConnectorRegistry.ts once every registration is
 * built, before the registry is handed back to the rest of bootstrap —
 * a violation must stop the process before it ever binds a port, not
 * surface later as a missing protection someone has to notice on their
 * own.
 */
export function assertConnectorCapabilitiesBound(
  registrations: readonly CapabilityBoundConnectorRegistration[],
): void {
  for (const registration of registrations) {
    for (const capability of registration.connector.capabilities.declared) {
      if (CANONICAL_CAPABILITY_POLICY_BINDINGS.has(capability)) {
        continue;
      }

      const allowlistReason =
        INTENTIONALLY_UNBOUND_CAPABILITIES.get(capability);

      if (allowlistReason !== undefined) {
        console.warn({
          event: "connector_capability_intentionally_unbound",
          capability,
          connectorId: registration.connectorIdentity.connectorId,
          reason: allowlistReason,
        });
        continue;
      }

      throw new Error(
        `Connector capability "${capability}" (connector ` +
          `"${registration.connectorIdentity.connectorId}") is registered but ` +
          `has no entry in CANONICAL_CAPABILITY_POLICY_BINDINGS and is not on ` +
          `the INTENTIONALLY_UNBOUND_CAPABILITIES allowlist. A caller could ` +
          `pair this capability with an unrelated, unprotected policy and ` +
          `bypass its intended boundSignals protections entirely (see ` +
          `CapabilityPolicyBinding.ts).\n\n` +
          "Add one of:\n" +
          "  1. An entry in CANONICAL_CAPABILITY_POLICY_BINDINGS " +
          "(packages/capability-registry/src/CapabilityPolicyBinding.ts) " +
          `binding "${capability}" to the policy that governs it.\n` +
          "  2. An entry in INTENTIONALLY_UNBOUND_CAPABILITIES " +
          "(packages/api/src/bootstrap/intentionallyUnboundCapabilities.ts) " +
          "with a documented reason, if leaving it unbound is a deliberate " +
          "decision.",
      );
    }
  }
}
