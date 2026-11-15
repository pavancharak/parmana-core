/**
 * How long an execute or reconcile call waits for a transaction's lock before
 * it is refused with 409 (decision D23, design section 7a, decision 4: "a
 * second execute on the same transaction waits for a short timeout, then
 * returns 409").
 */
export const EXECUTION_LOCK_TIMEOUT_MS = 2000;

/** Held while one execute or reconcile of a business transaction runs. */
export interface TransactionExecutionLease {
  release(): Promise<void>;
}

/**
 * A lock per business transaction, held for the whole of an execute, so two
 * executes of one transaction never decide, consume approvals or release at
 * the same time (design section 7a, decision 4).
 */
export interface TransactionExecutionLock {
  /**
   * Waits up to `timeoutMs` for the lock. Returns the lease, or null when the
   * lock is still held at the deadline.
   */
  acquire(
    businessTransactionId: string,
    timeoutMs: number,
  ): Promise<TransactionExecutionLease | null>;
}
