import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown when a status event would move a business transaction to a status
 * its current status does not allow (decision D23, design section 4), or when
 * the status the writer expected is no longer the current one.
 */
export class InvalidStatusTransitionError extends ParmanaError {
  constructor(businessTransactionId: string, detail: string) {
    super(
      "INVALID_STATUS_TRANSITION",
      `Business Transaction '${businessTransactionId}': ${detail}`,
      409,
    );
    this.name = "InvalidStatusTransitionError";
  }
}
