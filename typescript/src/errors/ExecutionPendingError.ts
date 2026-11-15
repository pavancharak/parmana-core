import type { ExecutionTrustRecord } from "../models/trust-record.js";

import { ErrorCode, ParmanaError } from "./ParmanaError.js";

/**
 * The execute call released the action and its signed record exists, but the
 * transaction's status could not be set to EXECUTED. The status is still
 * EXECUTING, so the outcome is pending until an operator reconciles it (the
 * server answers 202 for this case; see POST /transactions/{id}/execute).
 *
 * The action ran. Do not execute the transaction again: call
 * `reconcile(businessTransactionId)` on a human-credentialed client.
 */
export class ExecutionPendingError extends ParmanaError {
  /** The transaction whose outcome is pending. */
  public readonly businessTransactionId: string;

  /** The signed Execution Trust Record for the release that happened. */
  public readonly record: ExecutionTrustRecord;

  /** The path the server names for reconciliation. */
  public readonly reconcilePath: string;

  constructor(options: {
    readonly businessTransactionId: string;
    readonly record: ExecutionTrustRecord;
    readonly reconcilePath: string;
    readonly requestId?: string;
  }) {
    super({
      code: ErrorCode.EXECUTION_STATUS_PENDING,
      message:
        `The action for business transaction '${options.businessTransactionId}' ` +
        "was released and its trust record was written, but the status is still " +
        "EXECUTING: outcome pending until reconciled.",
      ...(options.requestId !== undefined && { requestId: options.requestId }),
    });

    this.name = "ExecutionPendingError";
    this.businessTransactionId = options.businessTransactionId;
    this.record = options.record;
    this.reconcilePath = options.reconcilePath;
  }
}
