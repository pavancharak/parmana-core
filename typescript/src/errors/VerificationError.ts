import { ErrorCode, ParmanaError } from "./ParmanaError.js";

/**
 * Raised when verification fails.
 */
export class VerificationError extends ParmanaError {
  constructor(
    message: string,
    options?: {
      requestId?: string;
      cause?: unknown;
    },
  ) {
    super({
      code: ErrorCode.VERIFICATION_ERROR,

      message,

      ...(options?.requestId !== undefined && {
        requestId: options.requestId,
      }),

      ...(options?.cause !== undefined && {
        cause: options.cause,
      }),
    });

    this.name = "VerificationError";
  }
}
