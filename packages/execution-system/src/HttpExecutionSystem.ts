import { ExecutionResult } from "@parmana/shared";

import { ExecutionRequest } from "./ExecutionRequest.js";
import { ExecutionSystem } from "./ExecutionSystem.js";
import { ExecutionSystemClientOptions } from "./ExecutionSystemClientOptions.js";

/**
 * Sends approved execution requests to an execution system over HTTP.
 *
 * `timeout` (milliseconds) is applied to the request. A request that does
 * not finish in time throws, and the caller must not assume it did not run:
 * the action may have run, so reconcile it.
 *
 * The response must have the shape of an ExecutionResult. A response that
 * does not is rejected rather than trusted.
 */
export class HttpExecutionSystem implements ExecutionSystem {
  constructor(private readonly options: ExecutionSystemClientOptions) {
    if (
      options.timeout !== undefined &&
      (!Number.isFinite(options.timeout) || options.timeout <= 0)
    ) {
      throw new Error("timeout must be a positive number of milliseconds.");
    }
    Object.freeze(this);
  }

  public async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const timeout = this.options.timeout;
    let response: Response;
    try {
      response = await fetch(`${this.options.baseUrl}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.options.headers,
        },
        body: JSON.stringify(request),
        ...(timeout !== undefined
          ? { signal: AbortSignal.timeout(timeout) }
          : {}),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error(
          `Execution System did not respond within ${timeout} ms. The action may have run; reconcile it.`,
          { cause: error },
        );
      }
      throw error;
    }

    if (!response.ok) {
      throw new Error(`Execution System returned HTTP ${response.status}.`);
    }

    return parseExecutionResult(await response.json());
  }
}

/**
 * Checks the fields a caller relies on, and returns the result with
 * executedAt as a Date. Anything else in the response is kept as sent.
 */
export function parseExecutionResult(value: unknown): ExecutionResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Execution System response is not an object.");
  }
  const body = value as Record<string, unknown>;

  for (const key of ["businessTransactionId", "action", "target"]) {
    if (typeof body[key] !== "string") {
      throw new Error(`Execution System response: ${key} must be a string.`);
    }
  }
  if (typeof body.success !== "boolean") {
    throw new Error("Execution System response: success must be a boolean.");
  }
  const parameters = body.parameters;
  if (
    typeof parameters !== "object" ||
    parameters === null ||
    Array.isArray(parameters)
  ) {
    throw new Error("Execution System response: parameters must be an object.");
  }
  if (
    typeof body.executedAt !== "string" ||
    Number.isNaN(Date.parse(body.executedAt))
  ) {
    throw new Error(
      "Execution System response: executedAt must be a timestamp string.",
    );
  }

  return { ...body, executedAt: new Date(body.executedAt) } as ExecutionResult;
}
