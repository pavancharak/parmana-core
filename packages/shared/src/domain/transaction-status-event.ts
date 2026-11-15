import type {
  TransactionStatus,
  TransactionStatusStage,
} from "./transaction-status.js";

/** One recorded status change of a business transaction. Append-only. */
export interface TransactionStatusEvent {
  readonly eventId: string;
  readonly businessTransactionId: string;
  /** Order of events for one transaction, starting at 1. */
  readonly sequence: number;
  readonly status: TransactionStatus;
  readonly stage: TransactionStatusStage;
  readonly occurredAt: Date;
  /** The record the stage produced, when it produced one. */
  readonly recordRef?: string;
  /** The reason, for failure and refusal events. Required for FAILED. */
  readonly reason?: string;
  /** True only for the RECEIVED events written by the migration. */
  readonly legacy: boolean;
}

/** The input for appending one event. The sequence is assigned by the repository. */
export interface AppendTransactionStatusEvent {
  readonly eventId: string;
  readonly businessTransactionId: string;
  /** The status the transaction must currently have (null: no events yet). */
  readonly from: TransactionStatus | null;
  readonly to: TransactionStatus;
  readonly stage: TransactionStatusStage;
  readonly occurredAt: Date;
  readonly recordRef?: string;
  readonly reason?: string;
}
