/**
 * The record of consumed Approval Artifact nonces (one use per approval).
 *
 * An approval is used once. The nonce is recorded in the same database
 * transaction as the status event that moves the business transaction to
 * APPROVED (decision D24). Two transactions that try to use one approval
 * cannot both reach APPROVED: the second write finds the nonce recorded and
 * is rolled back together with its status event.
 */
export interface ApprovalNonceConsumption {
  readonly nonce: string;
  /** The artifact's own expiresAt, kept for a later cleanup. */
  readonly expiresAt: string;
}

export interface ApprovalNonceLedger {
  /** True when the nonce has already been recorded. Reads only. */
  isConsumed(nonce: string): Promise<boolean>;

  /**
   * Records the nonce if it is unseen. Returns true when it was unseen and is
   * now recorded, false when it was already recorded. Used by the inbound
   * checks, which record their approvals with their own decision.
   */
  checkAndRecord(nonce: string, expiresAt: string): Promise<boolean>;
}
