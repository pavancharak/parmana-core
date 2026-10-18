import { ErrorCode, ParmanaError } from "./ParmanaError.js";

/**
 * Raised when communication with the Runtime fails.
 */
export class NetworkError extends ParmanaError {
  constructor(
    message: string,
    options?: {
      requestId?: string;
      cause?: unknown;
    },
  ) {
    super({
      code: ErrorCode.NETWORK_ERROR,

      message,

      ...(options?.requestId !== undefined && {
        requestId: options.requestId,
      }),

      ...(options?.cause !== undefined && {
        cause: options.cause,
      }),
    });

    this.name = "NetworkError";
  }
}
