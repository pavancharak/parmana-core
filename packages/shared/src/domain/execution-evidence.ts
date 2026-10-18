/**
 * Canonical execution evidence.
 *
 * Evidence returned by the enterprise execution
 * system after executing a Parmana-approved
 * BusinessTransaction.
 */
export interface ExecutionEvidence {
  /**
   * BusinessTransaction this evidence belongs to.
   */
  readonly businessTransactionId: string;

  /**
   * Action actually executed.
   */
  readonly action: string;

  /**
   * Target actually executed.
   */
  readonly target: string;

  /**
   * Parameters actually used.
   */
  readonly parameters: Readonly<Record<string, unknown>>;

  /**
   * Whether execution succeeded.
   */
  readonly success: boolean;

  /**
   * UTC execution timestamp.
   */
  readonly executedAt: Date;

  /**
   * Optional execution-system-specific evidence.
   */
  readonly attributes?: Readonly<Record<string, unknown>>;
}
