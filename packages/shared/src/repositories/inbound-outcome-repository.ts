/**
 * What happened to an inbound refund after Parmana issued its decision (RFC-0025).
 */
export interface InboundOutcomeRecord {
  readonly decisionId: string;
  readonly partnerId: string;
  readonly orderId: string;
  readonly paymentId: string;
  readonly amountInr: number;
  readonly status: "refunded" | "refused" | "error";
  readonly refundId?: string;
  readonly reason?: string;
  readonly recordedAt: Date;
}

/**
 * Append-only: one outcome per decision.
 */
export interface InboundOutcomeRepository {
  /** Returns false, and stores nothing, if an outcome for this decision already exists. */
  append(record: InboundOutcomeRecord): Promise<boolean>;

  findByDecisionId(decisionId: string): Promise<InboundOutcomeRecord | null>;
}
