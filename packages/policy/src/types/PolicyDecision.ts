import { PolicyOutcome } from "./PolicyOutcome.js";

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
}
