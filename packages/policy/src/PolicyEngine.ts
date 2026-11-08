import { OperatorEvaluator } from "./OperatorEvaluator.js";
import { findSignalTypeViolations } from "./signalTypes.js";

import type { Policy, PolicyCondition } from "./types/Policy.js";

import type { PolicySignals } from "./types/PolicySignals.js";

import type { PolicyDecision } from "./types/PolicyDecision.js";

import { PolicyAction } from "./types/PolicyAction.js";

import { PolicyOutcome } from "./types/PolicyOutcome.js";

/**
 * Canonical Policy Engine.
 *
 * Responsibilities
 * ----------------
 * - Evaluate exactly one policy.
 * - Return a deterministic PolicyDecision.
 *
 * This engine SHALL NOT:
 * - authorize execution
 * - execute business actions
 * - access external systems
 * - create trust records
 * - perform replay
 * - generate timestamps
 */
/**
 * The method that produces a policy verdict, and its version (G-148). Recorded with every decision
 * so a third party knows which rules of evaluation produced it. Bump the version when the evaluation
 * changes, not when a policy's rules change.
 */
export const POLICY_EVALUATION_METHOD = {
  id: "deterministic-rules",
  version: "2",
} as const;

/** A condition result that cannot be decided because a fact is missing. */
const UNKNOWN = "unknown" as const;

type Truth = boolean | typeof UNKNOWN;

export class PolicyEngine {
  private readonly operatorEvaluator = new OperatorEvaluator();

  /**
   * Evaluate exactly one policy.
   */
  public evaluate(policy: Policy, signals: PolicySignals): PolicyDecision {
    //
    // Every signal must have the type the policy declares for it before
    // any rule runs: a number sent as text would otherwise make every
    // numeric condition false and let a "reject if" rule pass silently.
    //
    const typeViolations = findSignalTypeViolations(policy, signals);

    if (typeViolations.length > 0) {
      return {
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        outcome: PolicyOutcome.REJECT,
        reason:
          "Rejected: signal(s) do not have the type the policy declares (" +
          typeViolations
            .map(
              (violation) =>
                `${violation.signalKey} must be ${violation.expected}, got ${violation.actual}`,
            )
            .join(", ") +
          ").",
        matchedRuleId: "signal-type-violation",
        evaluatedRules: 0,
        matchedPath: [],
      };
    }

    const trace: string[] = [];

    for (const rule of policy.rules) {
      trace.push(rule.id);

      const missing: string[] = [];
      const truth = this.truthOf(rule.condition, signals, missing);

      //
      // A rule whose result depends on a fact the request did not send
      // cannot be decided, so the request is refused rather than letting
      // a later rule match (PC-004). A rule that matches, or that does not
      // read the absent fact, is decided as before.
      //
      if (truth === UNKNOWN) {
        return {
          policyId: policy.policyId,
          policyVersion: policy.policyVersion,
          outcome: PolicyOutcome.REJECT,
          reason:
            "Rejected: signal(s) the decision depends on were not sent (" +
            Array.from(new Set(missing)).sort().join(", ") +
            ").",
          matchedRuleId: "missing-fact",
          evaluatedRules: trace.length,
          matchedPath: trace,
        };
      }

      if (truth) {
        return {
          policyId: policy.policyId,

          policyVersion: policy.policyVersion,

          outcome: this.toOutcome(rule.outcome.action),

          reason: rule.outcome.reason,

          matchedRuleId: rule.id,

          evaluatedRules: trace.length,

          matchedPath: trace,
        };
      }
    }

    return {
      policyId: policy.policyId,

      policyVersion: policy.policyVersion,

      outcome: this.toOutcome(undefined),

      reason: "no_rule_matched",

      matchedRuleId: "none",

      evaluatedRules: trace.length,

      matchedPath: trace,
    };
  }

  /**
   * Three-valued evaluation of a condition (Kleene logic). A condition that
   * reads a missing fact is UNKNOWN unless other parts of it already decide
   * the result: an AND with a false part is false, and an OR with a true
   * part is true. The facts read while UNKNOWN are added to `missing`.
   */
  private truthOf(
    condition: PolicyCondition,
    signals: PolicySignals,
    missing: string[],
  ): Truth {
    //
    // Leaf condition
    //
    if ("fact" in condition) {
      const signal = signals[condition.fact];

      if (signal === undefined) {
        missing.push(condition.fact);
        return UNKNOWN;
      }

      return this.operatorEvaluator.evaluate(
        signal,
        condition.operator,
        condition.value,
      );
    }

    //
    // Always
    //
    if ("always" in condition) {
      return true;
    }

    //
    // Logical AND
    //
    if ("all" in condition) {
      const parts = condition.all.map((child) =>
        this.truthOf(child, signals, missing),
      );

      if (parts.includes(false)) return false;
      if (parts.includes(UNKNOWN)) return UNKNOWN;
      return true;
    }

    //
    // Logical OR
    //
    if ("any" in condition) {
      const parts = condition.any.map((child) =>
        this.truthOf(child, signals, missing),
      );

      if (parts.includes(true)) return true;
      if (parts.includes(UNKNOWN)) return UNKNOWN;
      return false;
    }

    return false;
  }

  /**
   * Maps PolicyAction to PolicyOutcome.
   */
  private toOutcome(action?: PolicyAction): PolicyOutcome {
    switch (action) {
      case PolicyAction.APPROVE:
        return PolicyOutcome.APPROVE;

      case PolicyAction.REJECT:
      default:
        return PolicyOutcome.REJECT;
    }
  }
}
