import { ErrorCode, ParmanaError } from "./ParmanaError.js";

/**
 * Raised when a Runtime request times out.
 */
export class TimeoutError extends ParmanaError {
  constructor(
    message: string,
    options?: {
      requestId?: string;
      cause?: unknown;
    },
  ) {
    super({
      code: ErrorCode.TIMEOUT_ERROR,

      message,

      ...(options?.requestId !== undefined && {
        requestId: options.requestId,
      }),

      ...(options?.cause !== undefined && {
        cause: options.cause,
      }),
    });

    this.name = "TimeoutError";
  }
}
