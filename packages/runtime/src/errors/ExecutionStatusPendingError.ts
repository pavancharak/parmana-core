import type { ExecutionTrustRecord } from "@parmana/shared";

import { RuntimeError } from "./RuntimeError.js";

/**
 * The connector answered and the action was released, but the EXECUTED
 * status write failed, so the transaction's status is still EXECUTING (D23,
 * finding 18). The trust record exists and is signed.
 *
 * This is not a failure of the release: the action ran. It is raised so the
 * route can answer 202 with the record and outcome "pending", instead of a
 * 200 that says the transaction is complete while its status says otherwise.
 * Reconciliation writes EXECUTED from the release that is already recorded
 * (design section 6a); nothing is released again.
 */
export class ExecutionStatusPendingError extends RuntimeError {
  constructor(
    public readonly businessTransactionId: string,
    public readonly record: ExecutionTrustRecord,
  ) {
    super(
      `The action for business transaction '${businessTransactionId}' was released and its trust record was written, but the transaction's status could not be set to EXECUTED. The status is EXECUTING: outcome pending until reconciled with POST /transactions/${businessTransactionId}/reconcile.`,
      202,
      "EXECUTION_STATUS_PENDING",
    );
  }
}
