import { Signature } from "./signature.js";

/**
 * Execution Intent (ADR-0012).
 *
 * A signed statement, made and persisted BEFORE an action is released to a
 * connector, of exactly what is about to be released. It exists so that an
 * action that was released always has signed evidence behind it, even when the
 * Execution Trust Record cannot be produced afterwards (docs/VERIFICATION-GAPS.md
 * G-52 and G-53).
 *
 * What is signed is deliberately limited to facts that exist before release:
 * it never contains the execution result, and it never contains the raw
 * intent parameters (those are bound by `businessTransactionHash`, taken from
 * the signed authorization, so the intent can be checked against the
 * authorization without repeating potentially sensitive values).
 *
 * This is a separate record from the Execution Trust Record. The Trust Record
 * keeps its format and keeps verifying offline exactly as before.
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

  /**
   * Hash of the executable content, copied from the signed authorization
   * payload. It binds this intent to the exact action, target and
   * parameters that were authorized.
   */
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
 * Lifecycle of an intent. This is operational state kept next to the signed
 * intent, NOT part of what is signed, so it can change after signing.
 *
 * - PREPARED: the intent is signed and stored. The action may or may not have
 *   been released. An intent that stays here is the "released or not, the
 *   outcome is unrecorded" case and must be reconciled with the connector.
 * - RELEASED: the release stage returned and the execution context was saved,
 *   so the Trust Record can be rebuilt from it.
 * - FINALIZED: a signed Execution Trust Record exists for this transaction.
 * - ERRORED: the release stage raised an error. The action may still have been
 *   executed, so the outcome is unknown and must be reconciled.
 * - RESOLVED: a verified human reconciled a PREPARED or ERRORED intent at the
 *   connector and closed it, recording what they found (`resolution`) and a
 *   note. The resolution is an attributed operator statement stored in this
 *   unsigned status. It is NOT tamper evident, and it is not a Trust Record.
 */
export type ExecutionIntentState =
  "PREPARED" | "RELEASED" | "FINALIZED" | "ERRORED" | "RESOLVED";

/**
 * What an operator established at the connector when closing an intent that
 * has no Trust Record: the action did not run, or it did run.
 */
export type ExecutionIntentResolution = "NOT_EXECUTED" | "EXECUTED";

export type ExecutionIntentFinalizationMode = "INLINE" | "REPAIRED";

export interface ExecutionIntentStatus {
  readonly state: ExecutionIntentState;

  readonly releasedAt?: Date;

  readonly finalizedAt?: Date;

  readonly finalizationMode?: ExecutionIntentFinalizationMode;

  readonly trustRecordId?: string;

  readonly failureReason?: string;

  readonly resolvedAt?: Date;

  readonly resolvedBy?: string;

  readonly resolution?: ExecutionIntentResolution;

  readonly resolutionNote?: string;
}

/**
 * An intent as stored: the signed record, its operational status, and the
 * saved execution context used to rebuild the Trust Record when finalization
 * failed. `releasedContext` is present only in state RELEASED. It is deleted
 * when the intent becomes FINALIZED, because the Trust Record then holds the
 * same information and keeping a second copy of the execution context serves
 * no purpose.
 */
export interface StoredExecutionIntent {
  readonly intent: ExecutionIntent;

  readonly status: ExecutionIntentStatus;

  readonly releasedContext?: unknown;
}
