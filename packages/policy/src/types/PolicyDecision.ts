import { PolicyOutcome } from "./PolicyOutcome.js";

/**
 * Whether the evidence a verdict was decided on was complete and well-formed.
 *
 * - sufficient: every fact the evaluation read was present with its declared type.
 * - insufficient: at least one fact the evaluation needed was not sent. The
 *   verdict is a refusal, but it is not a finding that the facts were bad. It
 *   records which facts were missing.
 * - invalid: at least one fact was sent with a type the policy does not
 *   declare. The verdict is a refusal, and the record names the mistyped facts.
 *
 * A reader can therefore tell "the evidence was absent or unusable" from
 * "the evidence was complete and showed a refusal" (R5). Both still carry the
 * REJECT outcome, so existing consumers are unaffected.
 */
export type PolicyEvidenceStatus =
  | { readonly status: "sufficient" }
  | {
      readonly status: "insufficient";
      readonly missingFacts: readonly string[];
    }
  | {
      readonly status: "invalid";
      readonly invalidFacts: readonly string[];
    };

/**
 * The method that produced a verdict and its version (R3). Set by the
 * PolicyEngine that produced the verdict, not by its caller.
 */
export interface PolicyEvaluationMethod {
  readonly id: string;
  readonly version: string;
}

/**
 * Deterministic result returned by PolicyEngine.
 *
 * A PolicyDecision is a pure function of:
 *
 * - Policy
 * - Runtime Signals
 *
 * It intentionally contains no runtime metadata
 * such as timestamps, execution identifiers,
 * trust records or execution status.
 *
 * Runtime metadata belongs to the Execution Runtime,
 * not the Policy Engine.
 */
export interface PolicyDecision {
  /**
   * Evaluated policy identifier.
   */
  policyId: string;

  /**
   * Evaluated policy version.
   */
  policyVersion: string;

  /**
   * Final policy outcome.
   */
  outcome: PolicyOutcome;

  /**
   * Human-readable explanation.
   */
  reason: string;

  /**
   * Identifier of the matching rule.
   */
  matchedRuleId: string;

  /**
   * Number of evaluated rules.
   */
  evaluatedRules: number;

  /**
   * Ordered evaluation trace.
   */
  matchedPath: string[];

  /**
   * The method that produced this verdict and its version (R3). A verifier
   * that knows this method can recompute the verdict from the policy and the
   * signals. The engine sets it on every verdict, so no caller can omit it.
   */
  evaluationMethod: PolicyEvaluationMethod;

  /**
   * Whether the evidence was complete and well-formed (R5). Distinct from
   * outcome: an insufficient-evidence refusal and an evidenced refusal are
   * both REJECT, and only this field tells them apart.
   */
  evidence: PolicyEvidenceStatus;
}
