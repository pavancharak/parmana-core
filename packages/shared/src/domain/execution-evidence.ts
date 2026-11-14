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

  /**
   * Correspondence between the authorization and the content that was
   * dispatched. Absent on records written before this field existed; such
   * records are reported as "not checked", never as passed.
   */
  readonly correspondence?: ExecutionCorrespondence;
}

/**
 * Hash-level correspondence between an authorization and the dispatched
 * content. The dispatched hash is computed over the exact canonical content
 * passed to the connector, not over a redacted summary.
 */
export interface ExecutionCorrespondence {
  /** Version of this correspondence record. */
  readonly schemaVersion: 1;

  /** Nonce of the authorization this execution relied on. */
  readonly authorizationNonce: string;

  /** Authorization's businessTransactionHash (canonical content hash). */
  readonly authorizedContentHash: string;

  /** Canonical hash of the content actually passed to the connector. */
  readonly dispatchedContentHash: string;

  /** Policy content hash the authorization was signed against, when bound. */
  readonly policyContentHash?: string;

  /** Authority grant identifier the authorization relied on, when present. */
  readonly authorityGrantId?: string;
}
