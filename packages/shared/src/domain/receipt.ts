import type { SignatureEntry } from "./signature-entry.js";

/**
 * Parmana Trust Core
 *
 * Execution Trust Receipt
 *
 * A cryptographically verifiable receipt proving the
 * outcome of an Execution Trust Record.
 *
 * Receipts are immutable trust artifacts generated
 * automatically by Parmana.
 */
export interface Receipt {
  /**
   * Unique Receipt identifier.
   */
  readonly receiptId: string;

  /**
   * Business Transaction represented by this Receipt.
   */
  readonly businessTransactionId: string;

  /**
   * Execution represented by this Receipt.
   *
   * Undefined when the Receipt represents the
   * latest transaction state.
   */
  readonly executionId?: string;

  /**
   * Hash of the Execution Trust Record.
   *
   * Used for independent verification.
   */
  readonly trustRecordHash: string;

  /**
   * Hash of this Receipt.
   */
  readonly receiptHash: string;

  /**
   * Digital signature over the Receipt.
   */
  readonly signature: string;

  /**
   * Signing algorithm.
   *
   * Example:
   * Ed25519
   */
  readonly algorithm: string;

  /**
   * Envelope schema version (Hybrid Signature Support milestone,
   * Phase A). Absent means schema v1: exactly today's shape,
   * `signature`/`algorithm` above are the sole cryptographic
   * attestation. Present and >= 2 means `signatures` (below) was
   * populated at signing time and MUST be independently verified in
   * full. See the identical field on ExecutionTrustRecord.
   */
  readonly schemaVersion?: number;

  /**
   * Additional signatures over this Receipt, one per algorithm,
   * produced only when CRYPTO_MODE=hybrid was active at signing time.
   * See the identical field on ExecutionTrustRecord for the fail-
   * closed verification requirement.
   */
  readonly signatures?: readonly SignatureEntry[];

  /**
   * UTC timestamp when the Receipt
   * was generated.
   */
  readonly issuedAt: Date;
}
