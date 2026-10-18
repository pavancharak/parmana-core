import { Decision } from "./decision.js";
import { Signature } from "./signature.js";

/**
 * The subset of a Business Transaction's Intent a policy decision was
 * evaluated against. Mirrors @parmana/policy's own IntentSnapshot
 * shape exactly (target, parameters) rather than depending on
 * @parmana/policy from @parmana/shared, which would invert the
 * package dependency direction.
 */
export interface RefusalIntentSnapshot {
  readonly target?: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
}

/**
 * One boundSignals entry whose declared signal value did not match
 * the value found at its Intent dot-path. Mirrors
 * @parmana/policy's SignalIntentBindingViolation shape exactly, for
 * the same reason RefusalIntentSnapshot mirrors IntentSnapshot.
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
 * decision REJECTED a transaction — the REJECT-path counterpart to
 * ExecutionTrustRecord. Scope is deliberately narrow: this covers
 * PolicyEngine.evaluate REJECTs and SignalIntentBinder
 * binding-violation REJECTs only, not every kind of rejection this
 * system can produce (caller-auth failures and webhook signature
 * failures are a separate, unsigned audit-sink milestone; see
 * RFC-0021 Non-Goals). Any claim this record supports should be
 * scoped to "a policy decided to reject," not "every rejection of
 * any kind."
 *
 * Unlike ExecutionTrustRecord, this is not an append-only aggregate
 * with sub-histories (executions, receipts, ...) — a refusal is a
 * single terminal event for a transaction that was never accepted
 * for execution, so there is nothing to append to. At most one
 * RefusalRecord exists per businessTransactionId.
 */
export interface RefusalRecord {
  /**
   * Unique Refusal Record identifier.
   */
  readonly refusalRecordId: string;

  /**
   * Business Transaction this refusal is about.
   */
  readonly businessTransactionId: string;

  /**
   * The exact rejected Decision: decisionId, intentId, the policy
   * reference, the exact signals evaluated, outcome, reason,
   * evaluatedAt. Not summarized or reconstructed — the same Decision
   * object RuntimeEngine already builds before ExecutionGate.enforce()
   * throws.
   */
  readonly decision: Decision;

  /**
   * The exact Intent snapshot the signals were evaluated against.
   * Present for every refusal (not only binding violations) so an
   * ordinary policy REJECT and a signal/intent-binding REJECT are
   * evidenced the same way and stay directly comparable.
   */
  readonly evaluatedIntent: RefusalIntentSnapshot;

  /**
   * Present only when the rejection came from SignalIntentBinder.
   * Absent (not an empty array) for an ordinary PolicyEngine.evaluate
   * REJECT that never reached binding-violation logic at all.
   */
  readonly bindingViolations?: readonly RefusalBindingViolation[];

  /**
   * Authenticated caller who submitted the rejected request, from
   * the same server-set metadata.submittedBy field trust records and
   * isOwnedByCaller already rely on. Absent when caller-auth is
   * disabled.
   */
  readonly submittedBy?: string;

  /**
   * SHA-256 hash of the policy content that decided this refusal, the
   * same value an Execution Trust Record carries in
   * transaction.policy.contentHash. Computed by the runtime from the
   * policy that actually loaded, never from the request. Inside the
   * signed canonical record. Absent on Refusal Records written before
   * 2026-10-06, which still verify.
   */
  readonly policyContentHash?: string;

  /**
   * Canonical hash of this Refusal Record, same convention as
   * ExecutionTrustRecord.trustRecordHash.
   */
  readonly refusalRecordHash: string;

  /**
   * Cryptographic signature over the canonical Refusal Record. Proves
   * the refusal was recorded by Parmana and has not been modified
   * since. Signed with the same key (DEFAULT_KEY_ID) as
   * ExecutionTrustRecord — one root of trust for both approvals and
   * refusals (RFC-0021 §2).
   */
  readonly signature: Signature;

  /**
   * UTC timestamp when this Refusal Record was created.
   */
  readonly createdAt: Date;
}
