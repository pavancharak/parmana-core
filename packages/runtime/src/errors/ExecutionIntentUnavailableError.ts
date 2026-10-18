import { RuntimeError } from "./RuntimeError.js";

/**
 * Thrown BEFORE anything is released to a connector when the signed Execution
 * Intent could not be created and stored (ADR-0012).
 *
 * Fail closed on purpose: an action must not be released unless there is
 * signed evidence, stored first, of exactly what is being released. Refusing
 * here costs availability, and nothing has been executed. The caller can retry
 * once the signing path and storage are healthy, with a new
 * businessTransactionId because the original was already recorded as received.
 *
 * Extends RuntimeError so packages/api's error handler maps it to its own
 * .status and .code with no change.
 */
export class ExecutionIntentUnavailableError extends RuntimeError {
  constructor(
    public readonly businessTransactionId: string,
    cause?: unknown,
  ) {
    super(
      `The signed Execution Intent for business transaction '${businessTransactionId}' ` +
        "could not be created and stored; refusing to release the action. " +
        "Nothing was executed." +
        (cause instanceof Error ? ` Cause: ${cause.message}` : ""),
      503,
      "EXECUTION_INTENT_UNAVAILABLE",
    );
  }
}
