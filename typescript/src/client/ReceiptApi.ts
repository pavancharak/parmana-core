/**
 * Parmana Receipt API.
 *
 * Generate cryptographic execution receipts.
 */

import type { Receipt } from "../models/index.js";

import type { Transport } from "../config/Transport.js";

/**
 * Receipt API.
 *
 * Responsibilities
 * ----------------
 * - Generate execution receipts
 * - Retrieve the most recent receipt
 *
 * This API does NOT:
 * - execute Business Transactions
 * - replay executions
 * - verify trust records
 * - validate policies
 */
export class ReceiptApi {
  constructor(private readonly transport: Transport) {}

  /**
   * Generate an execution receipt.
   */
  public async generate(businessTransactionId: string): Promise<Receipt> {
    const response = await this.transport.send<Receipt>({
      method: "POST",
      path: "/receipt",
      body: {
        businessTransactionId,
      },
    });

    return response.body;
  }

  /**
   * Retrieve the most recent receipt without generating a new one. Maps to
   * GET /receipt/latest/:businessTransactionId, distinct from generate(),
   * which generates a new receipt.
   */
  public async getLatest(businessTransactionId: string): Promise<Receipt> {
    const response = await this.transport.send<Receipt>({
      method: "GET",
      path: `/receipt/latest/${encodeURIComponent(businessTransactionId)}`,
    });

    return response.body;
  }
}
