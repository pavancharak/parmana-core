/**
 * Parmana Execution API.
 *
 * Execute Business Transactions through the Parmana Runtime.
 */

import type {
  BusinessTransaction,
  ExecutionTrustRecord,
  PendingExecutionResponse,
} from "../models/index.js";

import { ExecutionPendingError } from "../errors/ExecutionPendingError.js";

import type { Transport } from "../config/Transport.js";

/**
 * Execution API.
 *
 * Responsibilities
 * ----------------
 * - Runtime health check
 * - Execute Business Transactions
 *
 * This API does NOT:
 * - verify trust records
 * - replay executions
 * - generate receipts
 * - validate policies
 */
export class ExecutionApi {
  constructor(private readonly transport: Transport) {}

  /**
   * Returns the Runtime health status.
   */
  public async health(): Promise<unknown> {
    const response = await this.transport.send({
      method: "GET",
      path: "/health",
    });

    return response.body;
  }

  /**
   * Returns the Runtime name, version, and API version. Requires caller
   * authentication, unlike GET /health.
   */
  public async version(): Promise<unknown> {
    const response = await this.transport.send({
      method: "GET",
      path: "/version",
    });

    return response.body;
  }

  /**
   * Execute a Business Transaction.
   */
  public async execute(
    transaction: BusinessTransaction,
  ): Promise<ExecutionTrustRecord> {
    const response = await this.transport.send<
      ExecutionTrustRecord | PendingExecutionResponse
    >({
      method: "POST",
      path: "/execute",
      body: transaction,
      nonThrowingStatuses: [202],
    });

    //
    // 202: the release happened and the record exists, but the status is
    // EXECUTING (see TransactionApi.execute).
    //
    if (response.status === 202) {
      const pending = response.body as PendingExecutionResponse;

      throw new ExecutionPendingError({
        businessTransactionId: pending.businessTransactionId,
        record: pending.record,
        reconcilePath: pending.reconcile,
      });
    }

    return response.body as ExecutionTrustRecord;
  }
}
