import { ErrorCode, ParmanaError } from "./ParmanaError.js";

/**
 * Raised when the Runtime rejects the request for a missing or invalid
 * caller bearer key (HTTP 401). See /api-reference/authentication.
 */
export class AuthenticationError extends ParmanaError {
  constructor(
    message: string,
    options?: {
      requestId?: string;
      cause?: unknown;
    },
  ) {
    super({
      code: ErrorCode.AUTHENTICATION_ERROR,

      message,

      ...(options?.requestId !== undefined && {
        requestId: options.requestId,
      }),

      ...(options?.cause !== undefined && {
        cause: options.cause,
      }),
    });

    this.name = "AuthenticationError";
  }
}
