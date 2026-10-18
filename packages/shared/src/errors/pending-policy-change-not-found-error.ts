import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown when a Pending Policy Change lookup (findById, resolve) is
 * given an id that does not exist.
 */
export class PendingPolicyChangeNotFoundError extends ParmanaError {
  constructor(pendingPolicyChangeId: string) {
    super(
      "PENDING_POLICY_CHANGE_NOT_FOUND",
      `Pending Policy Change '${pendingPolicyChangeId}' not found.`,
      404,
    );
  }
}
