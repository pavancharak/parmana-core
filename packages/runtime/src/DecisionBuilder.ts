import type { DecisionRequest } from "./RuntimeEngine.js";
import crypto from "node:crypto";

import type { DecisionAssessment, JsonValue } from "@parmana/shared";

import { Decision, DecisionOutcome } from "@parmana/shared";

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
    transaction: DecisionRequest,
    policyDecision: PolicyDecision,
    assessment?: DecisionAssessment,
  ): Decision {
    return {
      decisionId: crypto.randomUUID(),
      // Copied from the engine that produced the verdict (R3). The runtime
      // does not name the method itself, so the record cannot disagree with
      // the verdict about how it was reached.
      evaluationMethod: {
        id: policyDecision.evaluationMethod.id,
        version: policyDecision.evaluationMethod.version,
      },

      intentId: transaction.intent.intentId,

      policy: transaction.policy,

      signals: (transaction.signals ?? {}) as Record<string, JsonValue>,

      outcome: this.toDecisionOutcome(policyDecision.outcome),

      reason: policyDecision.reason,

      // Copied verbatim from PolicyEngine's own output, never
      // recomputed here (docs/internal/VERIFICATION-GAPS.md G-44): these three
      // previously existed only transiently in memory and were
      // dropped before anything durable was written.
      matchedRuleId: policyDecision.matchedRuleId,

      evaluatedRules: policyDecision.evaluatedRules,

      matchedPath: policyDecision.matchedPath,

      // Copied verbatim (R5): a reader of the record can tell absent
      // evidence from a refusal made on complete evidence.
      evidence: policyDecision.evidence,

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
