/**
 * Parmana Trust Core
 *
 * Override
 *
 * Records an authorized human override for a
 * Business Transaction.
 *
 * Overrides are immutable and become part of the
 * Execution Trust Record.
 */
export interface Override {
  /**
   * Unique Override identifier.
   */
  readonly overrideId: string;

  /**
   * Business Transaction to which this Override belongs.
   */
  readonly businessTransactionId: string;

  /**
   * Authorized user or system that approved
   * the Override.
   */
  readonly approvedBy: string;

  /**
   * Human-readable reason for the Override.
   */
  readonly reason: string;

  /**
   * Optional business justification.
   */
  readonly justification?: string;

  /**
   * UTC timestamp when the Override was approved.
   */
  readonly approvedAt: Date;
}
