import {
  ApprovalNonceAlreadyConsumedError,
  type ApprovalNonceConsumption,
  type ApprovalNonceLedger,
} from "@parmana/shared";

/**
 * In-memory approval nonce ledger. `recordAll` checks every nonce and records
 * them in one synchronous step, so a status write that consumes approvals is
 * as atomic as the Postgres one, where the nonces and the event share a
 * database transaction.
 */
export class MemoryApprovalNonceLedger implements ApprovalNonceLedger {
  private readonly consumed = new Map<string, string>();

  async isConsumed(nonce: string): Promise<boolean> {
    return this.consumed.has(nonce);
  }

  async checkAndRecord(nonce: string, expiresAt: string): Promise<boolean> {
    if (this.consumed.has(nonce)) {
      return false;
    }
    this.consumed.set(nonce, expiresAt);
    return true;
  }

  /**
   * Records every nonce, or none. Throws ApprovalNonceAlreadyConsumedError,
   * with nothing recorded, when any one of them is already recorded.
   */
  recordAll(nonces: readonly ApprovalNonceConsumption[]): void {
    const seen = new Set<string>();
    for (const { nonce } of nonces) {
      if (this.consumed.has(nonce) || seen.has(nonce)) {
        throw new ApprovalNonceAlreadyConsumedError(nonce);
      }
      seen.add(nonce);
    }
    for (const { nonce, expiresAt } of nonces) {
      this.consumed.set(nonce, expiresAt);
    }
  }
}
