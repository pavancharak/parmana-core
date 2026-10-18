/**
 * Approvers managed without a deploy: the keys trusted to sign approvals,
 * and the maker checker changes that add or revoke them.
 */

import type { PendingPolicyChangeStatus } from "./policy-change.js";

/**
 * A key the server trusts, or trusted, to sign approvals.
 */
export interface ApprovalIssuer {
  readonly approverId: string;
  readonly keyId: string;

  /**
   * Ed25519 public key, PEM (SPKI).
   */
  readonly publicKeyPem: string;

  /**
   * true: every approval signed with this key is refused.
   */
  readonly revoked: boolean;

  /**
   * "code": listed in the server code, changed only by a deploy.
   * "governed": added through an approver change.
   */
  readonly source: "code" | "governed";

  readonly addedByChangeId?: string;
  readonly addedAt?: string;
  readonly revokedByChangeId?: string;
  readonly revokedAt?: string;
}

/**
 * A proposal to add or revoke an approver key, and its resolution.
 */
export interface ApprovalIssuerChange {
  /**
   * Sign the step up authorization for approve or reject with this id as
   * `pendingPolicyChangeId`.
   */
  readonly changeId: string;
  readonly action: "add" | "revoke";
  readonly approverId: string;
  readonly keyId: string;
  readonly publicKeyPem?: string;
  readonly reason: string;
  readonly proposedBy: string;
  readonly proposedAt: string;
  readonly status: PendingPolicyChangeStatus;
  readonly resolvedBy?: string;
  readonly resolvedAt?: string;
  readonly rejectionReason?: string;
}

/**
 * What proposeApproverChange() sends.
 */
export type ProposeApproverChangeInput =
  | {
      readonly action: "add";
      readonly approverId: string;
      readonly keyId: string;
      /**
       * The .public.pem file scripts/generate-approver-key.ts writes.
       */
      readonly publicKeyPem: string;
      readonly reason: string;
    }
  | {
      readonly action: "revoke";
      readonly approverId: string;
      readonly keyId: string;
      readonly reason: string;
    };
