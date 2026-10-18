import {
  AuthorityRequiredError,
  AuthorizationRequiredError,
  DecisionNotApprovedError,
  DecisionOutcome,
  IntentRequiredError,
  ValidationError,
} from "@parmana/shared";

import { RuntimeContext } from "../context/RuntimeContext.js";
import type { RuntimeComponent } from "../RuntimeComponent.js";

/**
 * Trust Chain Validation Component.
 *
 * Ensures the Business Transaction contains
 * the minimum trust artifacts required before
 * execution may begin.
 *
 * This component validates runtime preconditions
 * only. It does not evaluate business policy.
 */
export class TrustChainValidationComponent implements RuntimeComponent {
  async execute(context: RuntimeContext): Promise<RuntimeContext> {
    const transaction = context.transaction;

    //
    // Authority
    //
    if (!transaction.authority) {
      throw new AuthorityRequiredError();
    }

    //
    // Authorization
    //
    if (!transaction.authorization) {
      throw new AuthorizationRequiredError();
    }

    //
    // Intent
    //
    if (!transaction.intent) {
      throw new IntentRequiredError();
    }

    //
    // Policy
    //
    if (!transaction.policy) {
      throw new ValidationError(
        "POLICY_REQUIRED",
        "Policy is required before execution.",
      );
    }

    //
    // Decision
    //
    if (!context.decision) {
      throw new ValidationError(
        "DECISION_REQUIRED",
        "Decision is required before execution.",
      );
    }

    //
    // Only approved Decisions may execute.
    //
    if (context.decision.outcome !== DecisionOutcome.APPROVED) {
      throw new DecisionNotApprovedError();
    }

    return context;
  }
}
