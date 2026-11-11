import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown when an authorization was released, its nonce consumed, and the
 * release was refused before the connector ran. Nothing was executed.
 *
 * Returned to a retry of the same authorization, so the caller sees the
 * recorded reason instead of an "outcome unknown" response. The authorization
 * is spent, and a new request must be decided again.
 */
export class ReleaseNotDispatchedError extends ParmanaError {
  constructor(businessTransactionId: string, reason: string) {
    super(
      "RELEASE_NOT_DISPATCHED",
      `Not released for Business Transaction '${businessTransactionId}': ${reason}. ` +
        "Nothing was executed, and this authorization is spent. " +
        "Send a new request to be decided again.",
      409,
    );
  }
}
