import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown when a status event that would consume an Approval Artifact nonce
 * finds the nonce already recorded (decision D24). The event is not written,
 * so the transaction does not reach APPROVED on this write.
 */
export class ApprovalNonceAlreadyConsumedError extends ParmanaError {
  constructor(nonce: string) {
    super(
      "APPROVAL_NONCE_ALREADY_CONSUMED",
      `Approval nonce '${nonce}' has already been used.`,
      409,
    );
    this.name = "ApprovalNonceAlreadyConsumedError";
  }
}
