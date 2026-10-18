/**
 * Parmana Transaction API.
 *
 * Retrieve Business Transactions.
 */

import type {
  BusinessTransaction,
  ExecutionTrustRecord,
} from "../models/index.js";

import type { Transport } from "../config/Transport.js";

/**
 * Transaction API.
 *
 * Responsibilities
 * ----------------
 * - Create (execute) a Business Transaction via POST /transactions
 * - Retrieve Business Transactions
 * - List Business Transactions
 *
 * This API does NOT:
 * - verify trust records
 * - replay executions
 * - generate receipts
 */
export class TransactionApi {
  constructor(private readonly transport: Transport) {}

  /**
   * Create (execute) a Business Transaction. Maps to POST
   * /transactions: a second, independent entry point into the
   * identical application.execute() pipeline as ExecutionApi.execute()
   * (POST /execute). The only behavioral difference is the success
   * status code, 201 instead of 200; the response body shape is
   * otherwise identical.
   */
  public async create(
    transaction: BusinessTransaction,
  ): Promise<ExecutionTrustRecord> {
    const response = await this.transport.send<ExecutionTrustRecord>({
      method: "POST",
      path: "/transactions",
      body: transaction,
    });

    return response.body;
  }

  /**
   * Retrieve a Business Transaction.
   */
  public async get(
    businessTransactionId: string,
  ): Promise<BusinessTransaction> {
    const response = await this.transport.send<BusinessTransaction>({
      method: "GET",
      path: `/transactions/${encodeURIComponent(businessTransactionId)}`,
    });

    return response.body;
  }

  /**
   * List Business Transactions.
   */
  public async list(page = 1, pageSize = 25): Promise<BusinessTransaction[]> {
    const response = await this.transport.send<BusinessTransaction[]>({
      method: "GET",
      path: `/transactions?page=${page}&pageSize=${pageSize}`,
    });

    return response.body;
  }
}
