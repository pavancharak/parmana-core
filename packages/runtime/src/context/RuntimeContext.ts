import {
  BusinessTransaction,
  Decision,
  Execution,
  ExecutionEvidence,
  ExecutionTrustRecord,
  Override,
  Receipt,
  SignedExecutionAuthorization,
  Verification,
} from "@parmana/shared";

/**
 * Canonical Runtime Context.
 *
 * RuntimeContext is the immutable state passed
 * between Runtime Components.
 *
 * Runtime components append immutable execution
 * artifacts without modifying the original
 * BusinessTransaction.
 */
export interface RuntimeContext {
  /**
   * Canonical immutable Business Transaction.
   */
  readonly transaction: BusinessTransaction;

  /**
   * Decision produced by deterministic
   * Policy evaluation.
   */
  readonly decision: Decision;

  /**
   * Signed Execution Authorization proving Parmana
   * authorized this execution. Present only after
   * ExecutionGate has approved the Decision.
   */
  readonly authorization?: SignedExecutionAuthorization;

  /**
   * Execution artifact.
   */
  readonly execution?: Execution;

  /**
   * Optional human override.
   */
  readonly override?: Override;

  /**
   * Evidence captured during execution.
   */
  readonly evidence?: readonly ExecutionEvidence[];

  /**
   * Verification artifact.
   */
  readonly verification?: Verification;

  /**
   * Cryptographic receipt.
   */
  readonly receipt?: Receipt;

  /**
   * Final aggregate produced by the pipeline.
   */
  readonly trustRecord?: ExecutionTrustRecord;
}
