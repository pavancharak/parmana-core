import {
  Execution,
  ExecutionTrustRecord,
  Override,
  Receipt,
  Verification,
} from "../domain/index.js";

/**
 * Repository for immutable
 * Execution Trust Records.
 */
export interface ExecutionTrustRecordRepository {
  create(record: ExecutionTrustRecord): Promise<ExecutionTrustRecord>;

  findByTransactionId(
    businessTransactionId: string,
  ): Promise<ExecutionTrustRecord | null>;

  /**
   * Appends a new immutable Execution.
   */
  appendExecution(
    businessTransactionId: string,
    execution: Execution,
  ): Promise<void>;

  /**
   * @deprecated
   *
   * Parmana uses an append-only execution model.
   *
   * Execution state transitions must be represented
   * by appending a new immutable Execution using
   * appendExecution().
   *
   * This method exists only for backward
   * compatibility and should not be used in new
   * implementations.
   */
  replaceExecution(execution: Execution): Promise<void>;

  /**
   * Appends an immutable Override.
   */
  appendOverride(
    businessTransactionId: string,
    override: Override,
  ): Promise<void>;

  /**
   * Appends an immutable Verification.
   */
  appendVerification(
    businessTransactionId: string,
    verification: Verification,
  ): Promise<void>;

  /**
   * Appends an immutable Receipt.
   */
  appendReceipt(businessTransactionId: string, receipt: Receipt): Promise<void>;

  /**
   * Sums a numeric field of ExecutionEvidence.parameters across every
   * successfully executed Execution (status COMPLETED, evidence.success
   * true) whose evidence.action equals the given action and whose
   * evidence.executedAt falls within [since, until).
   *
   * Reads only already-persisted, already-signed Execution Trust
   * Record history -- no caller-supplied value influences the result.
   * Added (TD-23 closure, Phase 3B) as the authoritative,
   * reconciliation-grade source for cumulative authorization checks
   * that previously trusted a caller-declared signal; a real-time gate
   * may separately be enforced by its own atomic counter for reasons
   * that gate's own callers document, but this method remains the
   * ground truth to reconcile against.
   *
   * Optional: every pre-existing implementation of this interface
   * (including the several inline test fakes across packages/runtime's
   * own unit tests) must keep compiling and behaving identically
   * without adding it. Only MemoryExecutionTrustRecordRepository and
   * SupabaseExecutionTrustRecordRepository implement it.
   */
  sumSuccessfulExecutionAmounts?(
    action: string,
    parameterKey: string,
    since: Date,
    until: Date,
  ): Promise<number>;
}
