import { ErrorCode, ParmanaError } from "./ParmanaError.js";

/**
 * Raised when the Runtime returns HTTP 409: a duplicate
 * businessTransactionId, or an Execution Trust Record not yet in a state
 * that permits the requested operation (e.g. Receipt generation before
 * verification).
 */
export class ConflictError extends ParmanaError {
  constructor(
    message: string,
    options?: {
      requestId?: string;
      cause?: unknown;
    },
  ) {
    super({
      code: ErrorCode.CONFLICT_ERROR,

      message,

      ...(options?.requestId !== undefined && {
        requestId: options.requestId,
      }),

      ...(options?.cause !== undefined && {
        cause: options.cause,
      }),
    });

    this.name = "ConflictError";
  }
}
