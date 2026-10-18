import { ExecutionAssessmentStatus } from "@parmana/shared";

import { RuntimeError } from "./RuntimeError.js";

/**
 * The action was released to the execution system, but the call failed, so
 * whether it was performed is unknown (G-63).
 *
 * Raised for a release failure that carries no typed response of its own:
 * a connector that could not be reached, timed out, or answered with an
 * error. The Execution Intent for the transaction is stored in state
 * ERRORED at the same moment, which is the server's own record that the
 * outcome is unknown; this error makes the response say the same, with
 * the identifiers an operator needs to reconcile.
 *
 * Before this error existed such failures surfaced as a bare
 * `500 Internal Server Error` with no identifiers, indistinguishable from
 * any other server fault and inviting a blind retry.
 *
 * The cause's own message is deliberately NOT in the response: a connector
 * failure can name internal hosts or services, and this API never passes
 * internal failure detail to a caller (see packages/api/tests/integration/
 * execution-failure.integration.test.ts). The cause is kept on `cause`, in
 * the critical log line `execution_outcome_unknown`, and as the Execution
 * Intent's `failureReason` (returned by GET /execution-intents/{id}, which
 * is scoped to the caller that submitted the transaction, as before).
 *
 * 502: the failure is in the system behind Parmana, not in Parmana.
 *
 * RFC-0023 phase 4: the response also says `executionStatus:
 * EXECUTION_UNKNOWN`, the execution status of RFC-0023 for exactly this
 * case. It is never reported as failed: the action may have run.
 */
export class ExecutionOutcomeUnknownError extends RuntimeError {
  readonly executionStatus = ExecutionAssessmentStatus.EXECUTION_UNKNOWN;

  constructor(
    public readonly businessTransactionId: string,
    public readonly authorizationId: string | undefined,
    cause?: unknown,
  ) {
    super(
      `The action for business transaction '${businessTransactionId}' was ` +
        "released to the execution system, but the call failed, so whether " +
        "it was performed is unknown. Do not retry as a new transaction: " +
        "check the target system, then close the Execution Intent with " +
        `POST /execution-intents/${businessTransactionId}/resolve.` +
        (authorizationId !== undefined
          ? ` authorizationId: ${authorizationId}.`
          : ""),
      502,
      "EXECUTION_OUTCOME_UNKNOWN",
    );

    this.cause = cause;
  }
}
