import { RuntimeError } from "./RuntimeError.js";

/**
 * Thrown BEFORE anything is released to a connector when the evidence
 * signing path cannot currently produce a signed Execution Trust Record
 * (docs/VERIFICATION-GAPS.md G-52).
 *
 * Fail closed on purpose: releasing an action that cannot be recorded
 * leaves an executed action with no signed trust record. Refusing here
 * costs availability, and nothing has been executed. The caller can retry
 * once signing is healthy, with a new businessTransactionId because the
 * original was already recorded as received.
 *
 * Extends RuntimeError so packages/api's error handler maps it to its
 * own .status and .code with no change.
 */
export class SigningUnavailableError extends RuntimeError {
  constructor(cause?: unknown) {
    super(
      "Evidence signing is unavailable; refusing to release the action " +
        "because a signed Execution Trust Record could not be produced. " +
        "Nothing was executed." +
        (cause instanceof Error ? ` Cause: ${cause.message}` : ""),
      503,
      "SIGNING_UNAVAILABLE",
    );
  }
}
