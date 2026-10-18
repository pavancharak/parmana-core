/**
 * Parmana Audit Event API.
 */

import type { AuditEvent, Signature } from "../models/index.js";

import type { Transport } from "../config/Transport.js";

export class AuditApi {
  constructor(private readonly transport: Transport) {}

  /**
   * Verifies a signed caller-authentication audit event's signature.
   * Maps to POST /audit/verify -- takes the event
   * and its stored signature directly, not a lookup by id. No caller
   * authentication is required by this route, mirroring
   * RefusalApi.verify()'s independent third-party verifiability.
   */
  public async verify(
    event: AuditEvent,
    signature: Signature,
  ): Promise<boolean> {
    const response = await this.transport.send<{ valid: boolean }>({
      method: "POST",
      path: "/audit/verify",
      body: { event, signature },
    });

    // Only a boolean true counts. A string "false" is truthy.
    return response.body.valid === true;
  }
}
