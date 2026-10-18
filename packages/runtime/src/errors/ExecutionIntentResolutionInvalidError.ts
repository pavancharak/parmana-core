import { RuntimeError } from "./RuntimeError.js";

/**
 * Thrown by the resolve operation (ADR-0012) when the request is malformed:
 * `resolution` is not one of NOT_EXECUTED or EXECUTED, or `note` is missing,
 * blank, or longer than the limit. The note is required on purpose, because it
 * is the only record of what the operator found at the connector.
 */
export class ExecutionIntentResolutionInvalidError extends RuntimeError {
  constructor(reason: string) {
    super(
      `The resolution is invalid: ${reason}`,
      400,
      "EXECUTION_INTENT_RESOLUTION_INVALID",
    );
  }
}
