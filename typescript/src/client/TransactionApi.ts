/**
 * Parmana Transaction API.
 *
 * Retrieve Business Transactions.
 */

import type {
  BusinessTransaction,
  DeclaredTransaction,
  ExecutionTrustRecord,
  ReconcileResult,
  TransactionStatusResult,
} from "../models/index.js";

import type { Transport } from "../config/Transport.js";

/**
 * Transaction API.
 *
 * Responsibilities
 * ----------------
 * - Declare a Business Transaction (POST /transactions), then execute it
 *   (POST /transactions/{id}/execute), as two calls (decision D23)
 * - Read its status, and reconcile one whose outcome is pending
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
   * Declares a Business Transaction (POST /transactions). It is accepted and
   * recorded as RECEIVED. Nothing is decided, signed or released.
   */
  public async declare(
    transaction: BusinessTransaction,
  ): Promise<DeclaredTransaction> {
    const response = await this.transport.send<DeclaredTransaction>({
      method: "POST",
      path: "/transactions",
      body: transaction,
    });

    return response.body;
  }

  /**
   * Executes a declared Business Transaction (POST
   * /transactions/{id}/execute). Returns the Execution Trust Record.
   */
  public async execute(
    businessTransactionId: string,
  ): Promise<ExecutionTrustRecord> {
    const response = await this.transport.send<ExecutionTrustRecord>({
      method: "POST",
      path: `/transactions/${encodeURIComponent(businessTransactionId)}/execute`,
    });

    return response.body;
  }

  /**
   * Declares and then executes a Business Transaction in two calls, and
   * returns the Execution Trust Record. The API before decision D23 offered
   * this as one call; it is kept so existing callers keep working.
   */
  public async create(
    transaction: BusinessTransaction,
  ): Promise<ExecutionTrustRecord> {
    const declared = await this.declare(transaction);

    return this.execute(declared.businessTransactionId);
  }

  /**
   * Reads the current status of a Business Transaction, and its history when
   * `history` is true (GET /transactions/{id}/status).
   */
  public async status(
    businessTransactionId: string,
    options: { history?: boolean } = {},
  ): Promise<TransactionStatusResult> {
    const query = options.history ? "?history=true" : "";
    const response = await this.transport.send<TransactionStatusResult>({
      method: "GET",
      path: `/transactions/${encodeURIComponent(businessTransactionId)}/status${query}`,
    });

    return response.body;
  }

  /**
   * Reconciles a Business Transaction whose outcome is pending. Operator
   * credentials only (POST /transactions/{id}/reconcile).
   */
  public async reconcile(
    businessTransactionId: string,
  ): Promise<ReconcileResult> {
    const response = await this.transport.send<ReconcileResult>({
      method: "POST",
      path: `/transactions/${encodeURIComponent(businessTransactionId)}/reconcile`,
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
