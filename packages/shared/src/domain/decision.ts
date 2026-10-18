import { PolicyReference } from "./policy-reference.js";

import type { JsonValue } from "../types/Json.js";
import type { DecisionAssessment } from "./business-validation.js";

/**
 * Parmana Trust Core
 *
 * Decision
 *
 * Immutable result produced by evaluating an
 * Intent against a Policy.
 *
 * Decision does not create authority.
 * Decision does not grant authorization.
 * Decision does not modify intent.
 *
 * Decision records only the outcome of
 * deterministic Policy evaluation.
 */
export interface Decision {
  /**
   * Unique Decision identifier.
   */
  readonly decisionId: string;

  /**
   * Intent evaluated by this Decision.
   */
  readonly intentId: string;

  /**
   * Exact Policy used.
   */
  readonly policy: PolicyReference;

  /**
   * Runtime signals evaluated by the policy.
   *
   * These are captured to support deterministic
   * replay and independent verification.
   */
  readonly signals: Record<string, JsonValue>;

  /**
   * Policy evaluation outcome.
   */
  readonly outcome: DecisionOutcome;

  /**
   * Optional explanation.
   */
  readonly reason?: string;

  /**
   * Identifier of the Policy rule that matched, or "none" when no rule
   * matched. Optional and caller-unsettable, the same pattern as
   * PolicyReference.contentHash (G-24): a request-supplied Decision
   * never carries this -- it is copied verbatim from
   * PolicyEngine.evaluate()'s PolicyDecision by DecisionBuilder, never
   * computed here. Absent only on a Decision built before this field
   * existed (docs/VERIFICATION-GAPS.md G-44); every Decision built
   * going forward carries it.
   */
  readonly matchedRuleId?: string;

  /**
   * Number of rules PolicyEngine evaluated before reaching a match (or
   * exhausting the rule list). Same provenance and optionality as
   * matchedRuleId above.
   */
  readonly evaluatedRules?: number;

  /**
   * Ordered rule-id trace PolicyEngine walked to reach matchedRuleId --
   * lets an auditor independently reconstruct exactly how this
   * Decision was reached, not merely which rule ultimately matched.
   * Same provenance and optionality as matchedRuleId above.
   */
  readonly matchedPath?: readonly string[];

  /**
   * UTC timestamp when evaluation completed.
   */
  readonly evaluatedAt: Date;

  /**
   * Authority, business validation and, for a refusal, execution, each
   * as its own status (RFC-0023). Absent on decisions made before it
   * existed; those records still verify.
   */
  readonly assessment?: DecisionAssessment;
}

/**
 * Canonical Decision outcomes.
 */
export enum DecisionOutcome {
  APPROVED = "APPROVED",

  REJECTED = "REJECTED",
}
