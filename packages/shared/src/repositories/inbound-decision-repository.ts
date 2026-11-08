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
  /** Who approved the request, when a verified human approval decided it (G-143). */
  readonly approvedBy?: string;
  readonly approvedKeyId?: string;
  readonly approvalId?: string;
  readonly approvedAt?: string;
}

/** An approval nonce to consume with a decision (G-143, O1). */
export interface ConsumedApprovalNonce {
  readonly nonce: string;
  readonly expiresAt: string;
}

/** A decision tried to use an approval that was already used. Nothing was recorded. */
export class ApprovalAlreadyUsedError extends Error {
  constructor(public readonly nonce: string) {
    super("This approval has already been used.");
    this.name = "ApprovalAlreadyUsedError";
  }
}

/** Repository for inbound checks (RFC-0024). Append-only: a decision is written once. */
export interface InboundCheckRepository {
  /** Throws if a decision with the same decisionId already exists. */
  append(record: InboundCheckRecord): Promise<void>;

  /**
   * Writes the decision and consumes the approvals it used, as one unit (G-143, O1). If any approval was
   * already used, nothing is written and ApprovalAlreadyUsedError is thrown.
   */
  appendConsumingApprovals(
    record: InboundCheckRecord,
    approvals: readonly ConsumedApprovalNonce[],
  ): Promise<void>;

  findById(decisionId: string): Promise<InboundCheckRecord | null>;
}
