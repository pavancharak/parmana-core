import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown when an approver change lookup or resolution is given an id
 * that does not exist.
 */
export class ApprovalIssuerChangeNotFoundError extends ParmanaError {
  constructor(changeId: string) {
    super(
      "APPROVAL_ISSUER_CHANGE_NOT_FOUND",
      `Approver change '${changeId}' not found.`,
      404,
    );
  }
}
