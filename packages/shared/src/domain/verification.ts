/**
 * Parmana Trust Core
 *
 * Verification
 *
 * Records the result of verifying an entire
 * Execution Trust Record.
 *
 * Verifications are immutable trust artifacts.
 */
export interface Verification {
  /**
   * Unique Verification identifier.
   */
  readonly verificationId: string;

  /**
   * Business Transaction being verified.
   */
  readonly businessTransactionId: string;

  /**
   * Verification result.
   */
  readonly status: VerificationStatus;

  /**
   * Human-readable verification summary.
   */
  readonly message?: string;

  /**
   * UTC timestamp when verification completed.
   */
  readonly verifiedAt: Date;

  /**
   * Digest (hash) of the verified
   * Execution Trust Record.
   *
   * Used to prove exactly which record
   * was verified.
   */
  readonly trustRecordHash: string;
}

/**
 * Canonical verification outcomes.
 */
export enum VerificationStatus {
  VERIFIED = "VERIFIED",

  FAILED = "FAILED",
}
