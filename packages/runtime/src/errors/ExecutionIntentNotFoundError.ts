import { RuntimeError } from "./RuntimeError.js";

/**
 * Thrown by the finalize operation (ADR-0012) when no Execution Intent exists
 * for a business transaction. Transactions that predate ADR-0012 have none.
 */
export class ExecutionIntentNotFoundError extends RuntimeError {
  constructor(public readonly businessTransactionId: string) {
    super(
      `No Execution Intent exists for business transaction '${businessTransactionId}'. ` +
        "Transactions created before Execution Intents were introduced have none.",
      404,
      "EXECUTION_INTENT_NOT_FOUND",
    );
  }
}
