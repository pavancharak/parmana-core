import type { BusinessTransaction } from "../domain/index.js";
import type { AppendTransactionStatusEvent } from "../domain/transaction-status-event.js";
import { InvalidStatusTransitionError } from "../errors/invalid-status-transition-error.js";

/**
 * Stores a declared Business Transaction together with its first status event
 * (decision D23, design section 3). Both are kept, or neither is: an
 * implementation must write the transaction and the event in one atomic step,
 * so that no stored transaction is ever left without a status.
 *
 * A duplicate businessTransactionId is refused with
 * DuplicateBusinessTransactionError, and nothing is written.
 */
export interface TransactionDeclarationStore {
  declare(
    transaction: BusinessTransaction,
    firstEvent: AppendTransactionStatusEvent,
  ): Promise<void>;
}

/**
 * The first event of a declared transaction must be RECEIVED, written by the
 * declare stage, with no earlier status, for the same transaction. Refused
 * otherwise, before anything is written.
 */
export function checkDeclarationEvent(
  transaction: BusinessTransaction,
  firstEvent: AppendTransactionStatusEvent,
): void {
  if (
    firstEvent.businessTransactionId !== transaction.businessTransactionId ||
    firstEvent.from !== null ||
    firstEvent.to !== "RECEIVED" ||
    firstEvent.stage !== "declare"
  ) {
    throw new InvalidStatusTransitionError(
      transaction.businessTransactionId,
      "the first event of a declared transaction must be RECEIVED, at stage declare, with no earlier status",
    );
  }
}
