import { ExecutionTransaction } from "@parmana/shared";

import type { RuntimeComponent } from "../RuntimeComponent.js";
import { RuntimeError } from "../errors/RuntimeError.js";

/**
 * Validates that an ExecutionTransaction contains Evidence.
 *
 * This stage performs validation only.
 * It does not modify the transaction.
 */
export class EvidenceStage implements RuntimeComponent {
  /**
   * Executes the Evidence validation stage.
   *
   * @param transaction Immutable execution transaction.
   * @returns The same immutable execution transaction.
   * @throws RuntimeError if Evidence is missing.
   */
  public execute(transaction: ExecutionTransaction): ExecutionTransaction {
    if (!transaction.evidence) {
      throw new RuntimeError("ExecutionTransaction must contain Evidence.");
    }

    return transaction;
  }
}
