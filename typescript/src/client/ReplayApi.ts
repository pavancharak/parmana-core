/**
 * Parmana TypeScript SDK
 *
 * Replay API.
 *
 * Replay Business Transactions.
 */

import type { Transport } from "../config/Transport.js";

import type { ReplayResult } from "../models/replay-result.js";

/**
 * Replay API.
 */
export class ReplayApi {
  constructor(private readonly transport: Transport) {}

  /**
   * Replay a Business Transaction.
   */
  public async replay(businessTransactionId: string): Promise<ReplayResult> {
    const response = await this.transport.send<ReplayResult>({
      method: "POST",
      path: "/replay",
      body: {
        businessTransactionId,
      },
    });

    return response.body;
  }
}
