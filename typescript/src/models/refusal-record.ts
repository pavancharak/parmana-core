import type { Decision } from "./execution.js";
import type { Signature } from "./signature.js";

/**
 * The subset of a Business Transaction's Intent a policy decision was
 * evaluated against. Mirrors @parmana/policy's own IntentSnapshot
 * shape exactly (target, parameters).
 */
export interface RefusalIntentSnapshot {
  readonly target?: string;
  readonly parameters?: Record<string, unknown>;
}

/**
 * One boundSignals entry whose declared signal value did not match
 * the value found at its Intent dot-path. Mirrors
 * @parmana/policy's SignalIntentBindingViolation shape exactly.
 */
export interface RefusalBindingViolation {
  readonly signalKey: string;
  readonly intentPath: string;
  readonly signalValue: unknown;
  readonly intentValue: unknown;
}

/**
 * Refusal Record (RFC-0021).
 *
 * Durable, signed, independently verifiable evidence that a policy
 * decision REJECTED a transaction -- the REJECT-path counterpart to
 * ExecutionTrustRecord. At most one RefusalRecord exists per
 * businessTransactionId.
 */
export interface RefusalRecord {
  readonly refusalRecordId: string;
  readonly businessTransactionId: string;
  readonly decision: Decision;
  readonly evaluatedIntent: RefusalIntentSnapshot;
  /**
   * Present only when the rejection came from SignalIntentBinder.
   * Absent (not an empty array) for an ordinary PolicyEngine.evaluate
   * REJECT that never reached binding-violation logic at all.
   */
  readonly bindingViolations?: readonly RefusalBindingViolation[];
  /**
   * Authenticated caller who submitted the rejected request. Absent
   * when caller-auth is disabled.
   */
  readonly submittedBy?: string;
  /**
   * SHA-256 hash of the policy content that decided the refusal. Absent
   * on Refusal Records written before 2026-10-06.
   */
  readonly policyContentHash?: string;
  readonly refusalRecordHash: string;
  readonly signature: Signature;
  readonly createdAt: Date;
}
