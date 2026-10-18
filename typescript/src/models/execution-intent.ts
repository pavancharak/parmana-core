import type { Signature } from "./signature.js";
import type { ExecutionTrustRecord } from "./trust-record.js";

/**
 * Execution Intent (ADR-0012).
 *
 * A signed statement, made and stored BEFORE an action is released to a
 * connector, of exactly what is about to be released. It exists so that an
 * action that was released always has signed evidence behind it, even when the
 * Execution Trust Record cannot be produced afterwards.
 *
 * It contains only facts that exist before release: never the execution
 * result, and never the raw intent parameters (`businessTransactionHash` binds
 * it to them). An intent proves what was about to be released. It does NOT
 * prove the action was released, or what its result was. At most one exists per
 * businessTransactionId.
 */
export interface ExecutionIntent {
  readonly intentId: string;
  readonly businessTransactionId: string;
  readonly decisionId: string;
  readonly authorizationId: string;
  readonly policyName: string;
  readonly policyVersion: string;
  readonly policyContentHash?: string;
  readonly signalsHash?: string;
  readonly businessTransactionHash: string;
  readonly action: string;
  readonly target: string;
  readonly submittedBy?: string;
  readonly grantedCapability?: string;
  readonly createdAt: Date;
  readonly intentHash: string;
  readonly signature: Signature;
}

/**
 * Operational state kept next to a signed intent. It is NOT signed.
 *
 * - PREPARED: signed and stored. The action may or may not have been released.
 * - RELEASED: the release stage returned and the execution context was saved.
 * - FINALIZED: a signed Execution Trust Record exists.
 * - ERRORED: the release stage raised an error. The action may still have run.
 * - RESOLVED: a verified human reconciled a PREPARED or ERRORED intent at the
 *   connector and closed it.
 */
export type ExecutionIntentState =
  "PREPARED" | "RELEASED" | "FINALIZED" | "ERRORED" | "RESOLVED";

/** What an operator found at the connector when closing an intent. */
export type ExecutionIntentResolution = "NOT_EXECUTED" | "EXECUTED";

/** How a Trust Record came to exist for an intent. */
export type ExecutionIntentFinalizationMode = "INLINE" | "REPAIRED";

export interface ExecutionIntentStatus {
  readonly state: ExecutionIntentState;
  readonly releasedAt?: Date;
  readonly finalizedAt?: Date;
  readonly finalizationMode?: ExecutionIntentFinalizationMode;
  readonly trustRecordId?: string;
  readonly failureReason?: string;
  /**
   * The next four are set only when state is RESOLVED. A resolution is an
   * attributed, timestamped statement by an operator. It is NOT tamper evident
   * and it is NOT a Trust Record.
   */
  readonly resolution?: ExecutionIntentResolution;
  readonly resolutionNote?: string;
  readonly resolvedBy?: string;
  readonly resolvedAt?: Date;
}

/** An intent and its status, as returned by the intent routes. */
export interface ExecutionIntentView {
  readonly intent: ExecutionIntent;
  readonly status: ExecutionIntentStatus;
}

/** Response of GET /execution-intents/unfinalized. */
export interface UnfinalizedExecutionIntents {
  readonly intents: readonly ExecutionIntentView[];
}

/** FINALIZED: this call rebuilt the record. ALREADY_FINALIZED: it existed. */
export type FinalizeExecutionIntentOutcome = "FINALIZED" | "ALREADY_FINALIZED";

/** Response of POST /execution-intents/{businessTransactionId}/finalize. */
export interface FinalizeExecutionIntentResult {
  readonly outcome: FinalizeExecutionIntentOutcome;
  readonly businessTransactionId: string;
  readonly trustRecordId: string;
  readonly trustRecord: ExecutionTrustRecord;
}

/** Request body of POST /execution-intents/{businessTransactionId}/resolve. */
export interface ResolveExecutionIntentInput {
  readonly resolution: ExecutionIntentResolution;
  /** Required, at most 2000 characters. What you checked and found. */
  readonly note: string;
}

/**
 * RESOLVED: this call closed the intent. ALREADY_RESOLVED: it was already
 * closed, nothing was changed, and the original statement is returned.
 */
export type ResolveExecutionIntentOutcome = "RESOLVED" | "ALREADY_RESOLVED";

/** Response of POST /execution-intents/{businessTransactionId}/resolve. */
export interface ResolveExecutionIntentResult extends ExecutionIntentView {
  readonly outcome: ResolveExecutionIntentOutcome;
  readonly businessTransactionId: string;
}
