import { BusinessTransaction } from "../domain/index.js";

/**
 * Repository for Business Transactions.
 *
 * Implementations may use PostgreSQL, Supabase,
 * DynamoDB, etc.
 */
export interface BusinessTransactionRepository {
  /**
   * Creates a new Business Transaction. Insert-if-absent: an
   * implementation MUST atomically reject a businessTransactionId
   * that already exists by throwing DuplicateBusinessTransactionError
   * (@parmana/shared), rather than silently overwriting it or
   * relying on a separate exists()-then-create() check at the call
   * site, which cannot be atomic (see G-1,
   * docs/VERIFICATION-GAPS.md). Every implementation must surface
   * the same error type for a duplicate, so callers cannot behave
   * differently depending on the backing store.
   */
  create(transaction: BusinessTransaction): Promise<BusinessTransaction>;

  /**
   * Finds a Business Transaction.
   */
  findById(businessTransactionId: string): Promise<BusinessTransaction | null>;

  /**
   * Checks whether a Business Transaction exists.
   */
  exists(businessTransactionId: string): Promise<boolean>;

  /**
   * Lists Business Transactions.
   */
  list(page: number, pageSize: number): Promise<readonly BusinessTransaction[]>;
}
