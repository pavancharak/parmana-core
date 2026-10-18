/**
 * Local response-shape types for the two @parmana/api endpoints this
 * UI calls. Deliberately not imported from @parmana/shared -- this
 * package calls the API over plain HTTP (per the decision to bypass
 * @parmana/sdk for this first cut), and stays fully decoupled from
 * every other @parmana/* package rather than pulling in a workspace
 * dependency for types alone.
 */

export interface CallerIdentity {
  readonly callerId: string;
  readonly allowedPrincipalIds: readonly string[];
  readonly allowedCapabilities: readonly string[];
  readonly unrestrictedCapabilities: boolean;
}

export type PendingPolicyChangeStatus =
  "PENDING_APPROVAL" | "APPROVED" | "REJECTED";

/**
 * Mirrors GET /policies/pending-changes's per-item response shape:
 * every PendingPolicyChange field, plus the diff view (`current` is
 * null only when the target policy version has never been published
 * before -- a brand-new version, not a replacement).
 */
export interface PendingPolicyChangeWithDiff {
  readonly pendingPolicyChangeId: string;
  readonly policyName: string;
  readonly policyVersion: string;
  readonly proposedContent: unknown;
  readonly proposedBy: string;
  readonly proposedAt: string;
  readonly status: PendingPolicyChangeStatus;
  readonly reason: string;
  readonly resolvedBy?: string;
  readonly resolvedAt?: string;
  readonly rejectionReason?: string;
  readonly diff: {
    readonly current: unknown | null;
    readonly proposed: unknown;
  };
}
