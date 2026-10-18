import { ExecutionTransaction } from "@parmana/shared";

import type { RuntimeComponent } from "../RuntimeComponent.js";
import { RuntimeError } from "../errors/RuntimeError.js";

/**
 * Validates that an ExecutionTransaction contains an Authorization.
 *
 * This stage performs validation only.
 * It does not modify the transaction.
 */
export class AuthorizationStage implements RuntimeComponent {
  /**
   * Executes the Authorization validation stage.
   *
   * @param transaction Immutable execution transaction.
   * @returns The same immutable execution transaction.
   * @throws RuntimeError if Authorization is missing.
   */
  public execute(transaction: ExecutionTransaction): ExecutionTransaction {
    if (!transaction.authorization) {
      throw new RuntimeError(
        "ExecutionTransaction must contain an Authorization.",
      );
    }

    return transaction;
  }
}
