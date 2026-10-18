import {
  BusinessTransaction,
  BusinessTransactionRepository,
} from "@parmana/shared";

import { DuplicateBusinessTransactionError } from "../errors/DuplicateBusinessTransactionError.js";
import { BusinessTransactionValidator } from "../validators/BusinessTransactionValidator.js";

/**
 * Application service responsible for accepting
 * Business Transactions.
 *
 * A Business Transaction becomes immutable once accepted.
 */
export class BusinessTransactionService {
  constructor(private readonly repository: BusinessTransactionRepository) {}

  /**
   * Accepts a new Business Transaction.
   */
  async accept(transaction: BusinessTransaction): Promise<BusinessTransaction> {
    //
    // Validate trust-chain invariants.
    //
    BusinessTransactionValidator.validate(transaction);

    //
    // Reject duplicate transactions.
    //
    const exists = await this.repository.exists(
      transaction.businessTransactionId,
    );

    if (exists) {
      throw new DuplicateBusinessTransactionError(
        transaction.businessTransactionId,
      );
    }

    //
    // Persist immutable transaction.
    //
    return this.repository.create(transaction);
  }

  /**
   * Retrieves a Business Transaction.
   */
  async get(
    businessTransactionId: string,
  ): Promise<BusinessTransaction | null> {
    return this.repository.findById(businessTransactionId);
  }

  /**
   * Lists Business Transactions.
   */
  async list(page = 1, pageSize = 25): Promise<readonly BusinessTransaction[]> {
    return this.repository.list(page, pageSize);
  }
}
