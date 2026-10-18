import { RuntimeError } from "./RuntimeError.js";

/**
 * Thrown by the finalize operation (ADR-0012) when an Execution Intent exists
 * but the saved execution context needed to rebuild the Trust Record does not.
 *
 * This is the honest limit of the repair: the intent proves what was about to
 * be released, but the result of the release was never saved, so the signed
 * Trust Record cannot be recreated. The outcome has to be established from the
 * connector and recorded by hand. Nothing is called and nothing is changed.
 */
export class ExecutionIntentNotFinalizableError extends RuntimeError {
  constructor(
    public readonly businessTransactionId: string,
    public readonly state: string,
  ) {
    super(
      `The Execution Intent for business transaction '${businessTransactionId}' ` +
        `is in state ${state} and has no saved execution result, so its signed ` +
        "Execution Trust Record cannot be rebuilt. The action may or may not " +
        "have been released. Establish the outcome from the connector and " +
        "reconcile it by hand. Nothing was called.",
      409,
      "EXECUTION_INTENT_RESULT_NOT_RECORDED",
    );
  }
}
