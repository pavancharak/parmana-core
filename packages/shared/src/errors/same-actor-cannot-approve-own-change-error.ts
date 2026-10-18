import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown when a caller attempts to approve or reject a
 * PendingPolicyChange it proposed itself — maker != checker,
 * enforced at the API layer (pending-policy-changes.ts), since only
 * the caller-auth layer knows the resolving caller's verified
 * identity. See PendingPolicyChange.resolvedBy's own doc comment.
 */
export class SameActorCannotApproveOwnChangeError extends ParmanaError {
  constructor(
    pendingPolicyChangeId: string,
    subject: string = "Pending Policy Change",
  ) {
    super(
      "SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE",
      `${subject} '${pendingPolicyChangeId}' was proposed by this same caller — ` +
        "the proposer (maker) may not also approve or reject it (checker).",
      403,
    );
  }
}
