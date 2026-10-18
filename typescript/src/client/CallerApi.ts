/**
 * Parmana Caller and Key API.
 *
 * Responsibilities
 * ----------------
 * - Report who the API key belongs to and what it may do
 * - Fetch a signing public key, for offline verification
 */

import type { CallerIdentity, PublicKeyInfo } from "../models/caller.js";

import type { Transport } from "../config/Transport.js";

export class CallerApi {
  constructor(private readonly transport: Transport) {}

  /**
   * Maps to GET /callers/me. Useful to check a key before sending
   * requests: which principal IDs it may act for and which capabilities it
   * may request.
   */
  public async me(): Promise<CallerIdentity> {
    const response = await this.transport.send<CallerIdentity>({
      method: "GET",
      path: "/callers/me",
    });

    return response.body;
  }

  /**
   * Maps to GET /keys/{keyId}. Records are signed with the key `default`.
   * Fetch it once, keep the PEM, and pass it to
   * verifyExecutionTrustRecordOffline() or verifyExecutionIntentOffline().
   * Needs no API key.
   */
  public async publicKey(keyId: string): Promise<PublicKeyInfo> {
    const response = await this.transport.send<PublicKeyInfo>({
      method: "GET",
      path: `/keys/${encodeURIComponent(keyId)}`,
    });

    return response.body;
  }
}
