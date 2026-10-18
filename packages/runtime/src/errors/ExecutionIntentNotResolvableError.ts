import { RuntimeError } from "./RuntimeError.js";

/**
 * Thrown by the resolve operation (ADR-0012) when an Execution Intent cannot be
 * closed by hand, because it is not in a state that allows it, or because a
 * signed Trust Record already exists for the transaction.
 *
 * Only a PREPARED or ERRORED intent can be resolved: those are the ones whose
 * outcome only an operator can establish at the connector. A RELEASED intent
 * has its execution result saved and is repaired with finalize. A FINALIZED
 * intent is already complete. Nothing is changed when this is thrown.
 */
export class ExecutionIntentNotResolvableError extends RuntimeError {
  constructor(
    public readonly businessTransactionId: string,
    public readonly state: string,
    hint: string,
  ) {
    super(
      `The Execution Intent for business transaction '${businessTransactionId}' ` +
        `is in state ${state} and cannot be resolved by hand. ${hint} ` +
        "Nothing was changed.",
      409,
      "EXECUTION_INTENT_NOT_RESOLVABLE",
    );
  }
}
