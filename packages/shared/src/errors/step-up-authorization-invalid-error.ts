import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown when a POST /policies/pending-changes/:id/approve or .../reject
 * request's stepUpAuthorization envelope fails verification (missing
 * signature, expired, replayed nonce, wrong key, or bound to a
 * different pendingPolicyChangeId/action) -- see
 * PolicyChangeStepUpVerifier. Fail-closed: the approval/rejection
 * never takes effect while this is thrown.
 */
export class StepUpAuthorizationInvalidError extends ParmanaError {
  /**
   * Per-check diagnostic detail, mirroring
   * PolicyChangeStepUpVerificationResult.checks -- an operator/checker
   * debugging a rejected step-up attempt should see exactly which
   * check failed, not just that one did (same reasoning
   * ApprovalVerificationResult/AuthorizationVerificationResult already
   * apply). Untyped here (@parmana/shared sits below @parmana/api in
   * the dependency graph, so this type cannot reference
   * PolicyChangeStepUpVerificationResult directly) -- the router
   * constructs this with the real checks object.
   */
  public readonly checks: Readonly<Record<string, boolean>>;

  constructor(checks: Readonly<Record<string, boolean>>) {
    super(
      "STEP_UP_AUTHORIZATION_INVALID",
      "The step-up authorization envelope is missing, invalid, expired, replayed, or does not match this request.",
      403,
    );

    this.checks = checks;
  }
}
