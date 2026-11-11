import type { PendingPolicyChangeStatus } from "./pending-policy-change.js";

/**
 * An approver key trusted to sign Approval Artifacts, added through
 * maker checker (approval-issuers.ts) instead of a deploy. The
 * server's code list (createApprovalIssuerRegistry.ts) is checked
 * first; these rows add to it.
 */
export interface ApprovalIssuerRecord {
  readonly approverId: string;
  readonly keyId: string;

  /**
   * The approver's Ed25519 public key, PEM (SPKI).
   */
  readonly publicKeyPem: string;

  /**
   * Revoking a key refuses every approval it ever signed.
   */
  readonly revoked: boolean;

  /**
   * The approved change that added this key. Its proposedBy and
   * resolvedBy say who asked and who approved.
   */
  readonly addedByChangeId: string;
  readonly addedAt: Date;

  /**
   * The capabilities this key may approve (G-50). An approval for any
   * other capability is refused. Empty grants nothing.
   */
  readonly capabilities: readonly string[];

  readonly revokedByChangeId?: string;
  readonly revokedAt?: Date;
}

export type ApprovalIssuerChangeAction = "add" | "revoke";

/**
 * A proposal to add or revoke an approver key, and its resolution. One
 * person proposes; a different person approves or rejects it with a
 * step up signature. Only an approved change touches
 * approval_issuers.
 */
export interface ApprovalIssuerChange {
  readonly changeId: string;
  readonly action: ApprovalIssuerChangeAction;
  readonly approverId: string;
  readonly keyId: string;

  /**
   * Required to add, absent to revoke.
   */
  readonly publicKeyPem?: string;

  /**
   * Required to add: the capabilities the key may approve. Absent to revoke.
   */
  readonly capabilities?: readonly string[];

  readonly reason: string;
  readonly proposedBy: string;
  readonly proposedAt: Date;
  readonly status: PendingPolicyChangeStatus;
  readonly resolvedBy?: string;
  readonly resolvedAt?: Date;
  readonly rejectionReason?: string;
}
