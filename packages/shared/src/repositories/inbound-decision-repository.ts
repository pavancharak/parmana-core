/**
 * An inbound refund decision Parmana issued (RFC-0025). Stored as issued: the signature is the
 * one Parmana made over the canonical fields, so a stored record can be re-verified later.
 */
export interface InboundDecisionRecord {
  readonly decisionId: string;
  readonly outcome: "approved" | "rejected";
  readonly reason?: string;
  readonly partnerId: string;
  readonly paymentId: string;
  readonly limitInr: number;
  readonly expiresAt: string;
  readonly audience: string;
  readonly signature: string;
  readonly issuedAt: Date;
}

/**
 * Repository for inbound refund decisions (RFC-0025). Append-only: a decision is written once
 * and never changed.
 */
export interface InboundDecisionRepository {
  /** Throws if a decision with the same decisionId already exists. */
  append(record: InboundDecisionRecord): Promise<void>;

  findById(decisionId: string): Promise<InboundDecisionRecord | null>;
}
