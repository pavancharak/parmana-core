/**
 * Parmana SDK
 *
 * Health API.
 *
 * Performs Runtime health checks.
 */

import type { Transport } from "../config/Transport.js";

export interface HealthStatus {
  readonly status: string;

  readonly version?: string;

  readonly timestamp?: string;
}

export class HealthApi {
  constructor(private readonly transport: Transport) {}

  /**
   * Returns Runtime health.
   */
  public async health(): Promise<HealthStatus> {
    const response = await this.transport.send<HealthStatus>({
      path: "/health",
      method: "GET",
    });

    return response.body;
  }
}
