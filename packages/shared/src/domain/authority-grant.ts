import type { AuthorityGrantLimit } from "./business-validation.js";
import type { PendingPolicyChangeStatus } from "./pending-policy-change.js";

/**
 * Authority granted to one caller for one capability (RFC-0023 phase
 * 3): "agent X may release goods, up to 100000, until 31 December".
 * Created only by an approved grant change; a revoke change marks it
 * revoked. A policy with requireAuthorityGrant decides a request only
 * when its caller holds a current grant for the action and the request
 * is within the grant's limits.
 */
export interface AuthorityGrant {
  /** The changeId of the approved grant change that created it. */
  readonly grantId: string;

  /** The authenticated caller (API key's callerId) it is granted to. */
  readonly callerId: string;

  /** The capability, namespace:verb, such as "erp:release-goods". */
  readonly capability: string;

  /** Limits on the request, by Intent path ("target", "parameters.x"). */
  readonly limits?: Readonly<Record<string, AuthorityGrantLimit>>;

  /** From when it holds. */
  readonly validFrom: Date;

  /** Until when it holds. After this, AUTHORITY_EXPIRED. */
  readonly validUntil: Date;

  readonly status: "active" | "revoked";
  readonly grantedAt: Date;
  readonly revokedByChangeId?: string;
  readonly revokedAt?: Date;
}

export type AuthorityGrantChangeAction = "grant" | "revoke";

/**
 * A proposal to grant authority to a caller for a capability, or to
 * revoke the active grant. One person proposes, a different person
 * approves or rejects with a step up authorization; neither may be the
 * caller the authority is granted to.
 */
export interface AuthorityGrantChange {
  readonly changeId: string;
  readonly action: AuthorityGrantChangeAction;
  readonly callerId: string;
  readonly capability: string;
  readonly limits?: Readonly<Record<string, AuthorityGrantLimit>>;
  /** grant only. Defaults to the approval time. */
  readonly validFrom?: Date;
  /** grant only, required. */
  readonly validUntil?: Date;
  readonly reason: string;
  readonly proposedBy: string;
  readonly proposedAt: Date;
  readonly status: PendingPolicyChangeStatus;
  readonly resolvedBy?: string;
  readonly resolvedAt?: Date;
  readonly rejectionReason?: string;
}
