import { ErrorCode, ParmanaError } from "./ParmanaError.js";

/**
 * Raised when the Runtime returns HTTP 404: the requested Business
 * Transaction, Execution Trust Record, Verification, Receipt, or Policy
 * does not exist.
 */
export class NotFoundError extends ParmanaError {
  constructor(
    message: string,
    options?: {
      requestId?: string;
      cause?: unknown;
    },
  ) {
    super({
      code: ErrorCode.NOT_FOUND_ERROR,

      message,

      ...(options?.requestId !== undefined && {
        requestId: options.requestId,
      }),

      ...(options?.cause !== undefined && {
        cause: options.cause,
      }),
    });

    this.name = "NotFoundError";
  }
}
