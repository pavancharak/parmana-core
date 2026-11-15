import { PolicyNotFoundError, findSignalTypeViolations } from "@parmana/policy";
import type { PolicyRepository } from "@parmana/policy";
import {
  BusinessTransaction,
  BusinessTransactionRepository,
} from "@parmana/shared";

import { BusinessTransactionValidationError } from "../errors/BusinessTransactionValidationError.js";
import { DuplicateBusinessTransactionError } from "../errors/DuplicateBusinessTransactionError.js";
import { BusinessTransactionValidator } from "../validators/BusinessTransactionValidator.js";

/**
 * Application service responsible for accepting
 * Business Transactions.
 *
 * A Business Transaction becomes immutable once accepted.
 */
export class BusinessTransactionService {
  /**
   * @param policyRepository Optional. When given, the signals a request
   * carries are checked against the policy's declared signalsSchema at
   * accept, so a mistyped signal is refused with 400 at declare, not later
   * at evaluation. Without it, the check is not run here.
   */
  constructor(
    private readonly repository: BusinessTransactionRepository,
    private readonly policyRepository?: PolicyRepository,
  ) {}

  /**
   * Accepts a new Business Transaction.
   */
  async accept(transaction: BusinessTransaction): Promise<BusinessTransaction> {
    //
    // Validate trust-chain invariants.
    //
    BusinessTransactionValidator.validate(transaction);

    //
    // Check the signals against the policy's declared types.
    //
    await this.assertSignalsMatchSchema(transaction);

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

  /**
   * The same rule the policy engine applies at evaluation
   * (findSignalTypeViolations): a signal present in the request must have
   * the type the policy declares for it in signalsSchema. An absent signal
   * and an undeclared one are not checked here.
   *
   * A policy that cannot be loaded is left to the decision, which reports
   * it as the refusal it already is, so this step does not change that
   * answer.
   */
  private async assertSignalsMatchSchema(
    transaction: BusinessTransaction,
  ): Promise<void> {
    if (this.policyRepository === undefined) {
      return;
    }

    let policy;

    try {
      policy = await this.policyRepository.load(
        transaction.policy.name,
        transaction.policy.version,
      );
    } catch (error) {
      if (error instanceof PolicyNotFoundError) {
        return;
      }

      throw error;
    }

    const [violation] = findSignalTypeViolations(
      policy,
      (transaction.signals ?? {}) as Parameters<
        typeof findSignalTypeViolations
      >[1],
    );

    if (violation !== undefined) {
      throw new BusinessTransactionValidationError(
        `signals.${violation.signalKey} must be a ${violation.expected}; got ${violation.actual}.`,
      );
    }
  }
}
