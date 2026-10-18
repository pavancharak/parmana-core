import { ErrorCode, ParmanaError } from "./ParmanaError.js";

/**
 * Raised when deterministic replay fails.
 */
export class ReplayError extends ParmanaError {
  constructor(
    message: string,
    options?: {
      requestId?: string;
      cause?: unknown;
    },
  ) {
    super({
      code: ErrorCode.REPLAY_ERROR,

      message,

      ...(options?.requestId !== undefined && {
        requestId: options.requestId,
      }),

      ...(options?.cause !== undefined && {
        cause: options.cause,
      }),
    });

    this.name = "ReplayError";
  }
}
