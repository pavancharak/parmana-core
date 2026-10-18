import { ExecutionAssessmentStatus } from "../domain/business-validation.js";
import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown by @parmana/execution-gateway's ExecutionGateway.execute() when
 * the only checks that failed are the ones RFC-0023 phase 4 adds at
 * release: a business condition the authorization rests on is past its
 * validUntil, or the authority grant it rests on has expired or been
 * revoked. Everything else verified, and nothing was sent to a
 * connector, so the action was not executed.
 *
 * A 409, like NonceAlreadyConsumedError, and for the same reason: it is
 * a fact about this authorization, not a server failure. The remedy is a
 * new request, decided again on current facts and authority.
 */
export class AuthorizationNoLongerValidError extends ParmanaError {
  readonly executionStatus = ExecutionAssessmentStatus.NOT_EXECUTED;

  constructor(businessTransactionId: string, reasons: readonly string[]) {
    super(
      "AUTHORIZATION_NO_LONGER_VALID",
      `Not released: what the authorization for business transaction '${businessTransactionId}' ` +
        `rests on no longer holds (${reasons.join("; ")}). Nothing was executed. ` +
        "Send a new request to be decided again.",
      409,
    );
  }
}
