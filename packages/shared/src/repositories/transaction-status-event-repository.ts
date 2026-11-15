import type {
  AppendTransactionStatusEvent,
  TransactionStatusEvent,
} from "../domain/transaction-status-event.js";

/**
 * Stores the status events of business transactions (decision D23).
 *
 * `append` is the only write. An implementation must, as one atomic step:
 * lock the transaction, read its current status, check that it equals
 * `from` and that `from` to `to` is allowed, assign the next sequence, and
 * insert the event. Otherwise it throws InvalidStatusTransitionError, and
 * nothing is written.
 */
export interface TransactionStatusEventRepository {
  append(input: AppendTransactionStatusEvent): Promise<TransactionStatusEvent>;

  /** The most recent event for the transaction, or null if it has none. */
  current(
    businessTransactionId: string,
  ): Promise<TransactionStatusEvent | null>;

  /** Every event for the transaction, in sequence order. */
  history(
    businessTransactionId: string,
  ): Promise<readonly TransactionStatusEvent[]>;
}
