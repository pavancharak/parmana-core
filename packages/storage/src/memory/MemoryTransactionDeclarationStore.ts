import {
  DuplicateBusinessTransactionError,
  checkDeclarationEvent,
  type AppendTransactionStatusEvent,
  type BusinessTransaction,
  type BusinessTransactionRepository,
  type TransactionDeclarationStore,
  type TransactionStatusEventRepository,
} from "@parmana/shared";

/**
 * In-memory declaration store. The event is checked before anything is written,
 * so the append after the create cannot fail for a reason the check did not
 * already report.
 */
export class MemoryTransactionDeclarationStore implements TransactionDeclarationStore {
  constructor(
    private readonly businessTransactions: BusinessTransactionRepository,
    private readonly events: TransactionStatusEventRepository,
  ) {}

  async declare(
    transaction: BusinessTransaction,
    firstEvent: AppendTransactionStatusEvent,
  ): Promise<void> {
    checkDeclarationEvent(transaction, firstEvent);

    if (
      await this.businessTransactions.exists(transaction.businessTransactionId)
    ) {
      throw new DuplicateBusinessTransactionError(
        transaction.businessTransactionId,
      );
    }

    await this.businessTransactions.create(transaction);
    await this.events.append(firstEvent);
  }
}
