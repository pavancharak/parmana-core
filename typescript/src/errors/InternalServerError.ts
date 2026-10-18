import { ErrorCode, ParmanaError } from "./ParmanaError.js";

/**
 * Raised when the Runtime encounters an internal error.
 *
 * `serverCode` carries the Runtime's own `code` field when the response had
 * one, so callers can tell apart failures that share this class. Two matter
 * for what to do next:
 * - `SIGNING_UNAVAILABLE` (503): the Runtime refused BEFORE releasing the
 *   action because it could not sign an Execution Trust Record. Nothing was
 *   executed. Retry once signing is healthy, with a NEW businessTransactionId.
 * - `EXECUTION_RECORD_INCOMPLETE` (500): the action WAS released to the
 *   execution system but its signed Execution Trust Record could not be
 *   produced. Do NOT retry as a new transaction, reconcile against the
 *   connector and the execution audit events for the businessTransactionId.
 * Undefined when the response carried no `code`.
 */
export class InternalServerError extends ParmanaError {
  public readonly serverCode?: string;

  constructor(
    message: string,
    options?: {
      requestId?: string;
      cause?: unknown;
      serverCode?: string;
    },
  ) {
    super({
      code: ErrorCode.INTERNAL_SERVER_ERROR,

      message,

      ...(options?.requestId !== undefined && {
        requestId: options.requestId,
      }),

      ...(options?.cause !== undefined && {
        cause: options.cause,
      }),
    });

    this.name = "InternalServerError";

    if (options?.serverCode !== undefined) {
      this.serverCode = options.serverCode;
    }
  }
}
