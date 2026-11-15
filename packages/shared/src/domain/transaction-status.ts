/**
 * The status of a business transaction, as recorded by transaction status
 * events (decision D23, design sections 3 and 4). OVERRIDDEN is not part of
 * this set (D23 section 7a).
 */
export const TRANSACTION_STATUSES = [
  "RECEIVED",
  "POLICY_EVALUATED",
  "APPROVED",
  "REJECTED",
  "EXECUTING",
  "EXECUTED",
  "FAILED",
  "VERIFIED",
] as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** The stage that wrote a status event. */
export const TRANSACTION_STATUS_STAGES = [
  "declare",
  "decide",
  "sign",
  "execute",
  "verify",
  "reconcile",
] as const;

export type TransactionStatusStage = (typeof TRANSACTION_STATUS_STAGES)[number];

/**
 * The statuses a transaction may move to from each status (design section 4).
 * A transaction with no events has no status; its only move is to RECEIVED.
 * REJECTED, FAILED and VERIFIED have no moves.
 */
const ALLOWED_NEXT: Readonly<
  Record<TransactionStatus, readonly TransactionStatus[]>
> = {
  RECEIVED: ["POLICY_EVALUATED"],
  POLICY_EVALUATED: ["APPROVED", "REJECTED"],
  // FAILED from APPROVED: a release refused or failed before EXECUTING (for
  // example signing), so nothing reached the connector. Not in the design's
  // section 4 table yet; see the commit message.
  APPROVED: ["EXECUTING", "FAILED"],
  EXECUTING: ["EXECUTED", "FAILED"],
  EXECUTED: ["VERIFIED"],
  REJECTED: [],
  FAILED: [],
  VERIFIED: [],
};

/** Whether a transaction whose current status is `from` may move to `to`. */
export function isAllowedTransition(
  from: TransactionStatus | null,
  to: TransactionStatus,
): boolean {
  if (from === null) {
    return to === "RECEIVED";
  }
  return ALLOWED_NEXT[from].includes(to);
}
