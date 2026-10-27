import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown when an authorization's nonce was already consumed and its execution
 * has no recorded result. The first attempt may have reached the connector,
 * so the outcome is unknown. Retrying would risk a second effect, and parmana
 * cannot say which happened.
 *
 * Gap G-125 (docs/VERIFICATION-GAPS.md). Callers must reconcile with the
 * external system before acting again. Reconciliation of these rows is not
 * built yet (Part 3 of G-125).
 */
export class OutcomeUnknownError extends ParmanaError {
  constructor(businessTransactionId: string) {
    super(
      "OUTCOME_UNKNOWN",
      `Execution Gateway rejected request for Business Transaction '${businessTransactionId}': ` +
        "an earlier attempt consumed this authorization and its outcome is not recorded. " +
        "Do not retry. Check the external system before acting again.",
      409,
    );
  }
}
