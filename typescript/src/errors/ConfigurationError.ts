import { ErrorCode, ParmanaError } from "./ParmanaError.js";

/**
 * Raised when SDK configuration is invalid.
 */
export class ConfigurationError extends ParmanaError {
  constructor(
    message: string,
    options?: {
      requestId?: string;
      cause?: unknown;
    },
  ) {
    super({
      code: ErrorCode.CONFIGURATION_ERROR,

      message,

      ...(options?.requestId !== undefined && {
        requestId: options.requestId,
      }),

      ...(options?.cause !== undefined && {
        cause: options.cause,
      }),
    });

    this.name = "ConfigurationError";
  }
}
