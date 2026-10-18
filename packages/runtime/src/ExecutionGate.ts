import { Decision, DecisionOutcome } from "@parmana/shared";

import { RuntimeError } from "./errors/RuntimeError.js";

/**
 * Canonical execution enforcement gate.
 *
 * Every execution MUST pass through this gate.
 * If the Decision is not approved,
 * execution is rejected.
 */
export class ExecutionGate {
  /**
   * Returns true when execution is permitted.
   */
  public canExecute(decision: Decision): boolean {
    return decision.outcome === DecisionOutcome.APPROVED;
  }

  /**
   * Enforces the decision.
   */
  public enforce(decision: Decision): void {
    if (this.canExecute(decision)) {
      return;
    }

    throw new RuntimeError(
      `Execution rejected: ${decision.reason ?? "Policy rejected execution."}`,
      403,
      "POLICY_DENIED",
    );
  }
}
