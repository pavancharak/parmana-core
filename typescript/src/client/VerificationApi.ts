/**
 * Parmana SDK
 *
 * Verification API.
 */

import type { Verification } from "../models/index.js";

import type { Transport } from "../config/Transport.js";

export class VerificationApi {
  constructor(private readonly transport: Transport) {}

  /**
   * Runs a fresh verification of an Execution Trust Record. Maps to
   * POST /verify. Each call re-verifies the record and appends a new
   * Verification to its history, distinct from getLatest() (GET
   * /verification/:id), which reads the most recent one without
   * re-verifying.
   */
  public async verify(businessTransactionId: string): Promise<Verification> {
    const response = await this.transport.send<Verification>({
      method: "POST",
      path: "/verify",
      body: {
        businessTransactionId,
      },
    });

    return response.body;
  }

  /**
   * Returns the latest Verification for a
   * Business Transaction, without performing a
   * fresh verification. Maps to GET
   * /verification/:id.
   */
  public async getLatest(businessTransactionId: string): Promise<Verification> {
    const response = await this.transport.send<Verification>({
      path: `/verification/${encodeURIComponent(businessTransactionId)}`,
      method: "GET",
    });

    return response.body;
  }
}
