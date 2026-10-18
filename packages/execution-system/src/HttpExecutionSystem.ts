import { ExecutionResult } from "@parmana/shared";

import type { ExecutionSystemClientOptions } from "./ExecutionSystemClientOptions.js";

import { ExecutionRequest } from "./ExecutionRequest.js";

import { ExecutionSystem } from "./ExecutionSystem.js";

/**
 * HTTP-based Execution System.
 *
 * Sends approved execution requests to an
 * external enterprise execution endpoint.
 */
export class HttpExecutionSystem implements ExecutionSystem {
  constructor(private readonly options: ExecutionSystemClientOptions) {
    Object.freeze(this);
  }

  public async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const response = await fetch(`${this.options.baseUrl}/execute`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",

        ...this.options.headers,
      },

      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Execution System returned HTTP ${response.status}.`);
    }

    return (await response.json()) as ExecutionResult;
  }
}
