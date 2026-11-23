import type {
  Decision,
  RefusalBindingViolation,
  RefusalIntentSnapshot,
} from "../domain/index.js";

/**
 * The inputs needed to build a Refusal Record later, saved when building and
 * storing it failed at the time of the refusal. Building is deterministic from
 * these inputs apart from the record id and creation time, which the builder
 * sets when it runs.
 */
export interface RefusalRecordOutboxEntry {
  readonly businessTransactionId: string;
  readonly decision: Decision;
  readonly evaluatedIntent: RefusalIntentSnapshot;
  readonly bindingViolations?: readonly RefusalBindingViolation[] | undefined;
  readonly submittedBy?: string | undefined;
  readonly policyContentHash?: string | undefined;
  readonly enqueuedAt: Date;
  readonly attempts: number;
  readonly lastError?: string | undefined;
}

/**
 * A durable queue of refusals whose Refusal Record was not written at the time
 * of refusal (RFC-0021). Entries are keyed by business transaction id, the same
 * key the refusal_records table uses, so a retry is idempotent.
 */
export interface RefusalRecordOutboxRepository {
  /** Saves an entry. Saving the same transaction id again keeps the first entry. */
  enqueue(entry: RefusalRecordOutboxEntry): Promise<void>;

  /** Entries not yet delivered, oldest first. */
  listPending(limit: number): Promise<RefusalRecordOutboxEntry[]>;

  /** Removes a delivered entry. */
  markDelivered(businessTransactionId: string): Promise<void>;

  /** Records a failed delivery attempt and its error. */
  recordFailure(businessTransactionId: string, error: string): Promise<void>;
}
