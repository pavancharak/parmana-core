import type {
  ApprovalIssuerChange,
  ApprovalIssuerRecord,
} from "../domain/approval-issuer.js";

/**
 * Approver keys added through maker checker, and the changes that add
 * or revoke them.
 */
export interface ApprovalIssuerRepository {
  findIssuer(
    approverId: string,
    keyId: string,
  ): Promise<ApprovalIssuerRecord | null>;

  listIssuers(): Promise<readonly ApprovalIssuerRecord[]>;

  /**
   * Stores a new PENDING_APPROVAL change. Throws ConflictError when
   * another change for the same approver and key is still pending.
   */
  createChange(change: ApprovalIssuerChange): Promise<ApprovalIssuerChange>;

  findChange(changeId: string): Promise<ApprovalIssuerChange | null>;

  listChanges(
    status?: ApprovalIssuerChange["status"],
  ): Promise<readonly ApprovalIssuerChange[]>;

  /**
   * Resolves a pending change to APPROVED and applies it, in one step:
   * add inserts the key, revoke marks it revoked. Throws
   * ApprovalIssuerChangeNotFoundError for an unknown id, and
   * ConflictError when the change is no longer pending, the key to add
   * already exists, or the key to revoke does not exist or is already
   * revoked. Nothing is written when it throws.
   */
  approveChange(
    changeId: string,
    approvedBy: string,
    at: Date,
  ): Promise<ApprovalIssuerChange>;

  /**
   * Resolves a pending change to REJECTED. Throws as approveChange does
   * for an unknown or already resolved change.
   */
  rejectChange(
    changeId: string,
    rejectedBy: string,
    rejectionReason: string,
    at: Date,
  ): Promise<ApprovalIssuerChange>;
}
