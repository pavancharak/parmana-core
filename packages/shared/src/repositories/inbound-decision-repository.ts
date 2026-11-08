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

/**
 * A signed decision for an inbound request on any capability (RFC-0024). It is stored in the
 * same table as refund decisions, in the columns added by the extension migration.
 */
export interface InboundCheckRecord {
  readonly decisionId: string;
  readonly outcome: "approved" | "rejected";
  readonly reason?: string;
  readonly partnerId: string;
  readonly capability: string;
  readonly target?: string;
  readonly amount?: number;
  /** The policy that decided the request, and its version. Absent when no policy was run. */
  readonly policyName?: string;
  readonly policyVersion?: string;
  readonly expiresAt: string;
  readonly audience: string;
  readonly signature: string;
  readonly issuedAt: Date;
}

/** Repository for inbound checks (RFC-0024). Append-only: a decision is written once. */
export interface InboundCheckRepository {
  /** Throws if a decision with the same decisionId already exists. */
  append(record: InboundCheckRecord): Promise<void>;

  findById(decisionId: string): Promise<InboundCheckRecord | null>;
}
