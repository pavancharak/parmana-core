/**
 * Parmana Trust Core
 *
 * Canonical Transaction Metadata
 *
 * Immutable metadata supplied by the calling application.
 * Metadata identifies the Business Transaction but is never
 * evaluated by Policy.
 */

export interface TransactionMetadata {
  /**
   * Unique Business Transaction identifier.
   *
   * Serves as:
   * - Primary business identifier
   * - Idempotency key
   * - Root identifier for the Execution Trust Record
   */
  readonly businessTransactionId: string;

  /**
   * Optional correlation identifier.
   *
   * Used to correlate requests across distributed systems.
   */
  readonly correlationId?: string;

  /**
   * Optional tenant identifier.
   */
  readonly tenantId?: string;

  /**
   * Originating application or service.
   */
  readonly sourceSystem?: string;

  /**
   * Identity of the authenticated caller.
   */
  readonly submittedBy?: string;

  /**
   * The capability (Business Transaction intent.action) that
   * isCapabilityAllowed() confirmed submittedBy was permitted to
   * invoke, server-set the same way submittedBy is -- never trusted
   * from the client. Present only when caller-auth was enabled for
   * this request; see ExecutionAuthorizationPayload.grantedCapability,
   * which this value is signed into.
   */
  readonly grantedCapability?: string;

  /**
   * UTC timestamp when the Business Transaction
   * was submitted.
   */
  readonly submittedAt?: Date;
}
