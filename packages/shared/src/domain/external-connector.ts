import type { PendingPolicyChangeStatus } from "./pending-policy-change.js";

/**
 * An external connector (ADR-0013): a capability bound to an HTTPS
 * endpoint an operator runs, and to the policy that governs it,
 * registered through maker checker (external-connectors.ts) instead of
 * a deploy. When a request for the capability is approved, Parmana
 * releases it to the endpoint as a signed release.
 */
export interface ExternalConnectorRegistration {
  /**
   * The changeId of the approved register change that created it. Its
   * proposedBy and resolvedBy say who asked and who approved.
   */
  readonly registrationId: string;

  /**
   * namespace:verb, never in a built in connector's namespace.
   */
  readonly capability: string;

  /**
   * https only, a public host. Also the audience of every release to it.
   */
  readonly endpointUrl: string;

  /**
   * The name of the policy that governs the capability. The version in
   * effect is decided by policy governance, as for every policy.
   */
  readonly policy: string;

  /**
   * The only parameter names Parmana forwards. A request with any other
   * parameter is refused before release.
   */
  readonly allowedParameters: readonly string[];

  readonly timeoutMs: number;

  /**
   * One active registration per capability. Nothing is deleted.
   */
  readonly status: "active" | "revoked";

  readonly registeredAt: Date;
  readonly revokedByChangeId?: string;
  readonly revokedAt?: Date;
}

export type ExternalConnectorChangeAction = "register" | "revoke";

/**
 * A proposal to register or revoke an external connector, and its
 * resolution. One person proposes; a different person approves or
 * rejects it with a step up signature. Only an approved change touches
 * external_connectors.
 */
export interface ExternalConnectorChange {
  readonly changeId: string;
  readonly action: ExternalConnectorChangeAction;
  readonly capability: string;

  /**
   * Required to register, absent to revoke.
   */
  readonly endpointUrl?: string;
  readonly policy?: string;
  readonly allowedParameters?: readonly string[];
  readonly timeoutMs?: number;

  readonly reason: string;
  readonly proposedBy: string;
  readonly proposedAt: Date;
  readonly status: PendingPolicyChangeStatus;
  readonly resolvedBy?: string;
  readonly resolvedAt?: Date;
  readonly rejectionReason?: string;
}
