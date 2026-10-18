/**
 * Parmana Trust Record API.
 *
 * Retrieve Execution Trust Records.
 */

import type { ExecutionTrustRecord } from "../models/index.js";

import type { Transport } from "../config/Transport.js";

/**
 * Trust Record API.
 */
export class TrustRecordApi {
  constructor(private readonly transport: Transport) {}

  /**
   * Retrieve an Execution Trust Record.
   */
  public async get(
    businessTransactionId: string,
  ): Promise<ExecutionTrustRecord> {
    const response = await this.transport.send<ExecutionTrustRecord>({
      method: "GET",
      path: `/trust-records/${encodeURIComponent(businessTransactionId)}`,
    });

    return response.body;
  }

  /**
   * List Execution Trust Records, newest first. Maps to GET /trust-records.
   * Only records of Business Transactions this caller submitted are
   * returned, so a page may hold fewer than `pageSize` records.
   *
   * @param options.since Only records of transactions created at or after
   *   this ISO 8601 time.
   * @param options.until Only records of transactions created at or before
   *   this ISO 8601 time.
   */
  public async list(
    page = 1,
    pageSize = 25,
    options: { readonly since?: string; readonly until?: string } = {},
  ): Promise<ExecutionTrustRecord[]> {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });

    if (options.since !== undefined) query.set("since", options.since);
    if (options.until !== undefined) query.set("until", options.until);

    const response = await this.transport.send<ExecutionTrustRecord[]>({
      method: "GET",
      path: `/trust-records?${query.toString()}`,
    });

    return response.body;
  }
}
