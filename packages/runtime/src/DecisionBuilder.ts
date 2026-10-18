import crypto from "node:crypto";

import type { DecisionAssessment, JsonValue } from "@parmana/shared";

import {
  BusinessTransaction,
  Decision,
  DecisionOutcome,
} from "@parmana/shared";

import { PolicyDecision, PolicyOutcome } from "@parmana/policy";

/**
 * Builds the canonical Decision artifact.
 *
 * Responsibilities:
 * - Assign a Decision identifier.
 * - Map PolicyOutcome to DecisionOutcome.
 * * - Preserve the evaluated PolicyReference.
 * - Capture runtime signals.
 *
 * This builder does NOT:
 * - evaluate policy
 * - execute actions
 * - authorize execution
 * - create Execution artifacts
 */
export class DecisionBuilder {
  /**
   * Builds an immutable Decision from a PolicyDecision.
   */
  public build(
    transaction: BusinessTransaction,
    policyDecision: PolicyDecision,
    assessment?: DecisionAssessment,
  ): Decision {
    return {
      decisionId: crypto.randomUUID(),

      intentId: transaction.intent.intentId,

      policy: transaction.policy,

      signals: (transaction.signals ?? {}) as Record<string, JsonValue>,

      outcome: this.toDecisionOutcome(policyDecision.outcome),

      reason: policyDecision.reason,

      // Copied verbatim from PolicyEngine's own output, never
      // recomputed here (docs/VERIFICATION-GAPS.md G-44): these three
      // previously existed only transiently in memory and were
      // dropped before anything durable was written.
      matchedRuleId: policyDecision.matchedRuleId,

      evaluatedRules: policyDecision.evaluatedRules,

      matchedPath: policyDecision.matchedPath,

      evaluatedAt: new Date(),

      ...(assessment !== undefined && { assessment }),
    };
  }

  /**
   * Maps the canonical PolicyOutcome into the
   * runtime DecisionOutcome.
   */
  private toDecisionOutcome(outcome: PolicyOutcome): DecisionOutcome {
    switch (outcome) {
      case PolicyOutcome.APPROVE:
        return DecisionOutcome.APPROVED;

      case PolicyOutcome.REJECT:
        return DecisionOutcome.REJECTED;

      default:
        return DecisionOutcome.REJECTED;
    }
  }
}
