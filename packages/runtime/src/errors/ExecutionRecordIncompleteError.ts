import { RuntimeError } from "./RuntimeError.js";

/**
 * Thrown when the action was already released to the execution system but
 * the signed Execution Trust Record could not be produced or persisted
 * afterwards (docs/VERIFICATION-GAPS.md G-52).
 *
 * This is deliberately NOT a generic 500. A generic failure tells a
 * caller nothing happened and invites a blind retry. This error says the
 * opposite: the action ran, the durable record is missing, and the
 * businessTransactionId and authorizationId identify what to reconcile.
 * Do not retry as a new transaction. Reconcile against the connector and
 * the execution audit events for the businessTransactionId first.
 */
export class ExecutionRecordIncompleteError extends RuntimeError {
  constructor(
    public readonly businessTransactionId: string,
    public readonly authorizationId: string | undefined,
    cause?: unknown,
  ) {
    super(
      `The action for business transaction '${businessTransactionId}' was ` +
        "released to the execution system, but its signed Execution Trust " +
        "Record could not be produced. Do not retry as a new transaction: " +
        "reconcile against the connector and the execution audit events for " +
        "this businessTransactionId." +
        (authorizationId !== undefined
          ? ` authorizationId: ${authorizationId}.`
          : "") +
        (cause instanceof Error ? ` Cause: ${cause.message}` : ""),
      500,
      "EXECUTION_RECORD_INCOMPLETE",
    );
  }
}
