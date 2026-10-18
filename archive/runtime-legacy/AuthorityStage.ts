import { RuntimeError } from "../errors/RuntimeError.js";
import type { RuntimeComponent } from "../RuntimeComponent.js";

import { ExecutionTransaction } from "@parmana/shared";

/**
 * Validates that an ExecutionTransaction contains an Authority.
 *
 * This stage performs validation only.
 * It does not modify the transaction.
 */
export class AuthorityStage implements RuntimeComponent {
  /**
   * Executes the Authority validation stage.
   *
   * @param transaction Immutable execution transaction.
   * @returns The same immutable execution transaction.
   * @throws RuntimeError if Authority is missing.
   */
  public execute(transaction: ExecutionTransaction): ExecutionTransaction {
    if (!transaction.authority) {
      throw new RuntimeError("ExecutionTransaction must contain an Authority.");
    }

    return transaction;
  }
}
