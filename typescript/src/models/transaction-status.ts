/**
 * Transaction status (decision D23). Hand-written SDK types for the
 * declare, execute, status and reconcile responses. They mirror the JSON the
 * API returns; the shared domain types are in packages/shared.
 */

/** The statuses a Business Transaction moves through (decision D23). */
export type TransactionStatusValue =
  | "RECEIVED"
  | "POLICY_EVALUATED"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "EXECUTED"
  | "FAILED"
  | "VERIFIED";

/** The stage that wrote a status event. */
export type TransactionStatusStage =
  "declare" | "decide" | "sign" | "execute" | "verify" | "reconcile";

/** One append-only status event. */
export interface TransactionStatusEvent {
  readonly eventId: string;
  readonly businessTransactionId: string;
  /** Position in the history, starting at 1. */
  readonly sequence: number;
  readonly status: TransactionStatusValue;
  readonly stage: TransactionStatusStage;
  readonly occurredAt: string;
  readonly recordRef?: string;
  readonly reason?: string;
  /** True for the RECEIVED event written for a transaction declared before status events existed. */
  readonly legacy: boolean;
}

/** The response of POST /transactions (declare). */
export interface DeclaredTransaction {
  readonly businessTransactionId: string;
  readonly status: TransactionStatusValue;
  readonly acceptedAt?: string;
  readonly transaction: unknown;
}

/** The response of GET /transactions/{id}/status. */
export interface TransactionStatusResult {
  readonly businessTransactionId: string;
  readonly current: TransactionStatusEvent;
  /** Present when the history was requested. Oldest first. */
  readonly history?: readonly TransactionStatusEvent[];
}

/** The response of POST /transactions/{id}/reconcile. */
export interface ReconcileResult {
  readonly businessTransactionId: string;
  readonly changed: boolean;
  readonly status: TransactionStatusValue;
}
