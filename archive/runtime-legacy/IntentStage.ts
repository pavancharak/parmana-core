import { ExecutionTransaction } from "@parmana/shared";

import type { RuntimeComponent } from "../RuntimeComponent.js";
import { RuntimeError } from "../errors/RuntimeError.js";

/**
 * Validates that an ExecutionTransaction contains an Intent.
 *
 * This stage performs validation only.
 * It does not modify the transaction.
 */
export class IntentStage implements RuntimeComponent {
  /**
   * Executes the Intent validation stage.
   *
   * @param transaction Immutable execution transaction.
   * @returns The same immutable execution transaction.
   * @throws RuntimeError if Intent is missing.
   */
  public execute(transaction: ExecutionTransaction): ExecutionTransaction {
    if (!transaction.intent) {
      throw new RuntimeError("ExecutionTransaction must contain an Intent.");
    }

    return transaction;
  }
}
