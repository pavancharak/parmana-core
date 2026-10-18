import type {
  ExecutionIntent,
  ExecutionIntentFinalizationMode,
  ExecutionIntentResolution,
  StoredExecutionIntent,
} from "../domain/index.js";

export interface ExecutionIntentResolutionInput {
  readonly resolution: ExecutionIntentResolution;

  readonly note: string;

  readonly resolvedBy?: string;

  readonly resolvedAt: Date;
}

/**
 * Persistence for Execution Intents (ADR-0012).
 *
 * `create` is the fail closed step: the runtime refuses to release an action
 * if it cannot complete. The `mark*` methods only move operational status and
 * never touch the signed intent. `markFinalized` must never move a
 * FINALIZED intent backwards, and every `mark*` is safe to repeat.
 */
export interface ExecutionIntentRepository {
  create(intent: ExecutionIntent): Promise<ExecutionIntent>;

  findByTransactionId(
    businessTransactionId: string,
  ): Promise<StoredExecutionIntent | null>;

  /** PREPARED to RELEASED, saving the context needed to rebuild the record. */
  markReleased(
    businessTransactionId: string,
    releasedContext: unknown,
    releasedAt: Date,
  ): Promise<void>;

  /** Any state except FINALIZED to FINALIZED. */
  markFinalized(
    businessTransactionId: string,
    trustRecordId: string,
    mode: ExecutionIntentFinalizationMode,
    finalizedAt: Date,
  ): Promise<void>;

  /** PREPARED to ERRORED. */
  markErrored(businessTransactionId: string, reason: string): Promise<void>;

  /**
   * PREPARED or ERRORED to RESOLVED. Returns true when this call moved the
   * intent, and false when it was in any other state, so a caller can tell a
   * lost race from a success. It never moves a RELEASED or FINALIZED intent.
   */
  markResolved(
    businessTransactionId: string,
    input: ExecutionIntentResolutionInput,
  ): Promise<boolean>;

  /**
   * Intents that are neither FINALIZED nor RESOLVED, oldest first. Used by
   * operators to find released actions that have no signed Trust Record, and
   * actions whose outcome nobody has reconciled yet.
   */
  listUnfinalized(limit: number): Promise<readonly StoredExecutionIntent[]>;
}
