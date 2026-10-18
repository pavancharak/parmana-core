/**
 * Execution Result
 *
 * Result returned by an Enterprise Execution System
 * after attempting to execute a Parmana-authorized
 * Business Transaction.
 *
 * Parmana converts an ExecutionResult into immutable
 * ExecutionEvidence for storage in the Execution
 * Trust Record.
 */
export interface ExecutionResult {
  /**
   * Business Transaction that was executed.
   */
  readonly businessTransactionId: string;

  /**
   * Action that was executed.
   */
  readonly action: string;

  /**
   * Target on which the action was executed.
   */
  readonly target: string;

  /**
   * Parameters actually supplied to the
   * Enterprise Execution System.
   */
  readonly parameters: Readonly<Record<string, unknown>>;

  /**
   * Whether execution succeeded.
   */
  readonly success: boolean;

  /**
   * Enterprise execution timestamp.
   */
  readonly executedAt: Date;

  /**
   * Optional execution-system-specific metadata.
   *
   * Examples:
   * - ERP transaction ID
   * - Payment reference
   * - CRM record ID
   * - Deployment ID
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
