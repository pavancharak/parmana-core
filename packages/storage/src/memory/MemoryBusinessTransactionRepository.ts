import {
  BusinessTransaction,
  BusinessTransactionRepository,
  DuplicateBusinessTransactionError,
} from "@parmana/shared";

/**
 * In-memory Business Transaction repository.
 *
 * Intended for development and testing.
 */
export class MemoryBusinessTransactionRepository implements BusinessTransactionRepository {
  private readonly transactions = new Map<string, BusinessTransaction>();

  /**
   * Closes G-1 (docs/VERIFICATION-GAPS.md): the has-check and the set
   * happen in the same synchronous tick, with no `await` between
   * them, exactly like MemoryNonceStore.checkAndRecord() (G-13) —
   * this Map itself is the atomicity mechanism, not a lock. Two
   * concurrent create() calls for the same id cannot interleave;
   * exactly one wins the check and the other throws.
   */
  async create(transaction: BusinessTransaction): Promise<BusinessTransaction> {
    if (this.transactions.has(transaction.businessTransactionId)) {
      throw new DuplicateBusinessTransactionError(
        transaction.businessTransactionId,
      );
    }

    this.transactions.set(transaction.businessTransactionId, transaction);

    return transaction;
  }

  async findById(
    businessTransactionId: string,
  ): Promise<BusinessTransaction | null> {
    return this.transactions.get(businessTransactionId) ?? null;
  }

  async exists(businessTransactionId: string): Promise<boolean> {
    return this.transactions.has(businessTransactionId);
  }

  async list(
    page: number,
    pageSize: number,
  ): Promise<readonly BusinessTransaction[]> {
    const values = [...this.transactions.values()];

    const start = (page - 1) * pageSize;

    return values.slice(start, start + pageSize);
  }
}
