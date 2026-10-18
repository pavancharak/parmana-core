import { DecisionOutcome, normalizePolicy } from "@parmana/shared";
import { PolicyEngine } from "@parmana/policy";
import type { Policy } from "@parmana/policy";
import type { ReplayInput } from "./types/ReplayInput.js";
import type { ReplayResult } from "./types/ReplayResult.js";
import { toPolicySignals } from "./utils/to-policy-signals.js";

export class ReplayEngine {
  private readonly policyEngine = new PolicyEngine();

  public replay(input: ReplayInput): ReplayResult {
    const trustRecord = input.trustRecord;

    if (!trustRecord?.executions?.length) {
      throw new Error("Invalid trust record");
    }

    const execution = trustRecord.executions[0];

    if (!execution?.decision) {
      throw new Error("Missing decision");
    }

    const recordedDecision = execution.decision;

    //
    // Canonical replay inputs
    //
    const signals = toPolicySignals(input.transaction.signals);

    const policy = normalizePolicy(input.policy ?? {}) as Policy;

    //
    // Deterministic policy evaluation
    //
    const policyDecision = this.policyEngine.evaluate(policy, signals);

    const replayedDecision = {
      decisionId: recordedDecision.decisionId,
      intentId: recordedDecision.intentId,
      policy: recordedDecision.policy,
      signals: recordedDecision.signals,

      outcome:
        policyDecision.outcome === "APPROVE"
          ? DecisionOutcome.APPROVED
          : DecisionOutcome.REJECTED,

      reason: policyDecision.reason,

      evaluatedAt: recordedDecision.evaluatedAt,
    };

    const matches = recordedDecision.outcome === replayedDecision.outcome;

    return {
      recordedDecision,
      replayedDecision,
      matches,

      // Preserve deterministic timestamp
      replayedAt: recordedDecision.evaluatedAt,
    };
  }
}
