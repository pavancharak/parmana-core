import { ErrorCode, ParmanaError } from "./ParmanaError.js";

/**
 * Raised when execution is rejected.
 */
export class ExecutionRejectedError extends ParmanaError {
  constructor(
    message: string,
    options?: {
      requestId?: string;
      cause?: unknown;
    },
  ) {
    super({
      code: ErrorCode.EXECUTION_REJECTED,

      message,

      ...(options?.requestId !== undefined && {
        requestId: options.requestId,
      }),

      ...(options?.cause !== undefined && {
        cause: options.cause,
      }),
    });

    this.name = "ExecutionRejectedError";
  }
}
