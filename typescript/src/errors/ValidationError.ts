import { ErrorCode, ParmanaError } from "./ParmanaError.js";

/**
 * Raised when request validation fails.
 */
export class ValidationError extends ParmanaError {
  constructor(
    message: string,
    options?: {
      requestId?: string;
      cause?: unknown;
    },
  ) {
    super({
      code: ErrorCode.VALIDATION_ERROR,

      message,

      ...(options?.requestId !== undefined && {
        requestId: options.requestId,
      }),

      ...(options?.cause !== undefined && {
        cause: options.cause,
      }),
    });

    this.name = "ValidationError";
  }
}
