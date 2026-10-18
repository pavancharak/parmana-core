/**
 * Parmana Refusal Record API (RFC-0021).
 */

import type { RefusalRecord } from "../models/index.js";

import type { Transport } from "../config/Transport.js";

export class RefusalApi {
  constructor(private readonly transport: Transport) {}

  /**
   * Verifies a Refusal Record's signature. Maps to POST
   * /refusal/verify -- takes the record itself, not a lookup by id.
   * No caller authentication is required by this route: it is the
   * capability that makes a refusal independently third-party
   * verifiable (RFC-0021).
   */
  public async verify(record: RefusalRecord): Promise<boolean> {
    const response = await this.transport.send<{ valid: boolean }>({
      method: "POST",
      path: "/refusal/verify",
      body: record,
    });

    // Only a boolean true counts. A string "false" is truthy.
    return response.body.valid === true;
  }

  /**
   * Retrieves a Refusal Record by Business Transaction ID. Maps to
   * GET /refusal/:businessTransactionId. Unlike verify() above, this
   * route is behind caller-auth and ownership scoping, identically to
   * TrustRecordApi.get().
   */
  public async get(businessTransactionId: string): Promise<RefusalRecord> {
    const response = await this.transport.send<RefusalRecord>({
      method: "GET",
      path: `/refusal/${encodeURIComponent(businessTransactionId)}`,
    });

    return response.body;
  }
}
