import { DecisionOutcome } from "@parmana/shared";

import type { RuntimeContext } from "../context/RuntimeContext.js";
import type { RuntimeHook } from "../hooks/RuntimeHook.js";

import type { AlertSink } from "./AlertSink.js";

/**
 * Sends one alert per decision, approved or refused (G-138).
 *
 * The hook does not wait for delivery. A slow or failing alert
 * destination never delays or changes the decision. RuntimeHook
 * contracts forbid changing deterministic behaviour, so any failure
 * is swallowed here and reported only through the sink's own result.
 */
export class DecisionAlertHook implements RuntimeHook {
  constructor(private readonly sink: AlertSink) {}

  async afterDecision(context: RuntimeContext): Promise<void> {
    const { decision, transaction } = context;

    const event = {
      type:
        decision.outcome === DecisionOutcome.APPROVED
          ? ("decision.approved" as const)
          : ("decision.refused" as const),
      occurredAt: new Date().toISOString(),
      businessTransactionId: transaction.businessTransactionId,
      decisionId: decision.decisionId,
      policyName: decision.policy.name,
      policyVersion: decision.policy.version,
      submittedBy: transaction.metadata?.submittedBy,
      reason: decision.reason,
    };

    this.sink.emit(event).catch(() => undefined);
  }
}
