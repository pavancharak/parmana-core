import type {
  AuthorityGrant,
  AuthorityGrantChange,
} from "../domain/authority-grant.js";

/**
 * Authority grants and the changes that make and revoke them (RFC-0023
 * phase 3). Only approveChange touches grants, and it applies the change
 * and resolves it in one step. At most one active grant and one pending
 * change exist per caller and capability.
 */
export interface AuthorityGrantRepository {
  /**
   * The active (not revoked) grant for this caller and capability, or
   * null. It may have expired or not yet begun: the caller decides what
   * that means.
   */
  findActive(
    callerId: string,
    capability: string,
  ): Promise<AuthorityGrant | null>;

  listGrants(): Promise<readonly AuthorityGrant[]>;

  createChange(change: AuthorityGrantChange): Promise<AuthorityGrantChange>;

  findChange(changeId: string): Promise<AuthorityGrantChange | null>;

  listChanges(
    status?: AuthorityGrantChange["status"],
  ): Promise<readonly AuthorityGrantChange[]>;

  approveChange(
    changeId: string,
    approvedBy: string,
    at: Date,
  ): Promise<AuthorityGrantChange>;

  rejectChange(
    changeId: string,
    rejectedBy: string,
    rejectionReason: string,
    at: Date,
  ): Promise<AuthorityGrantChange>;
}
