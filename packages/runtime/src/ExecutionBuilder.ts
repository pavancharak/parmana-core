import crypto from "node:crypto";

import {
  BusinessTransaction,
  Decision,
  Execution,
  ExecutionMode,
  ExecutionStatus,
} from "@parmana/shared";

/**
 * Builds the canonical Execution artifact.
 *
 * Responsibilities:
 * - Assign an Execution identifier.
 * - Bind the BusinessTransaction.
 * - Bind the Decision.
 * - Initialize execution state.
 *
 * This builder does NOT:
 * - execute business logic
 * - evaluate policy
 * - create trust records
 */
export class ExecutionBuilder {
  /**
   * Builds the initial Execution artifact.
   */
  public build(
    transaction: BusinessTransaction,
    decision: Decision,
  ): Execution {
    return {
      executionId: crypto.randomUUID(),

      businessTransactionId: transaction.businessTransactionId,

      decision,

      status: ExecutionStatus.PROCESSING,

      mode: ExecutionMode.SYNC,

      startedAt: new Date(),
    };
  }
}
