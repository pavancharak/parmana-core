import type { PendingPolicyChangeStatus } from "./pending-policy-change.js";

/**
 * A business system registered to answer policies' sourced facts
 * (RFC-0023 phase 2). Created only by an approved register change; a
 * revoke change marks it revoked. Policies name it by `name` in
 * signalSources.
 */
export interface BusinessSignalSourceRegistration {
  /** The changeId of the approved register change that created it. */
  readonly registrationId: string;

  /** The name policies use, such as "orders-system". */
  readonly name: string;

  /** The HTTPS endpoint Parmana sends each signed query to. */
  readonly endpointUrl: string;

  /** How long Parmana waits for an answer, 1000 to 30000 ms. */
  readonly timeoutMs: number;

  /**
   * The source's Ed25519 public key, PEM. When set, every answer must be
   * signed with it, and Parmana verifies the signature before it trusts
   * the answer. When absent, an answer proves only what Parmana observed.
   */
  readonly publicKeyPem?: string;

  /** A label for that key, carried into each Trusted Signal. */
  readonly keyId?: string;

  readonly status: "active" | "revoked";
  readonly registeredAt: Date;
  readonly revokedByChangeId?: string;
  readonly revokedAt?: Date;
}

export type BusinessSignalSourceChangeAction = "register" | "revoke";

/**
 * A proposal to register or revoke a business signal source. One person
 * proposes, a different person approves or rejects with a step up
 * authorization, the same rules as an external connector change.
 */
export interface BusinessSignalSourceChange {
  readonly changeId: string;
  readonly action: BusinessSignalSourceChangeAction;
  readonly name: string;
  readonly endpointUrl?: string;
  readonly timeoutMs?: number;
  readonly publicKeyPem?: string;
  readonly keyId?: string;
  readonly reason: string;
  readonly proposedBy: string;
  readonly proposedAt: Date;
  readonly status: PendingPolicyChangeStatus;
  readonly resolvedBy?: string;
  readonly resolvedAt?: Date;
  readonly rejectionReason?: string;
}
