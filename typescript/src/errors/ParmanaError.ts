/**
 * Parmana SDK
 *
 * Canonical base error for all SDK exceptions.
 *
 * Every SDK-specific exception MUST inherit from
 * ParmanaError.
 */

/**
 * Stable machine-readable error codes.
 */
export enum ErrorCode {
  CONFIGURATION_ERROR = "CONFIGURATION_ERROR",

  VALIDATION_ERROR = "VALIDATION_ERROR",

  AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR",

  AUTHORIZATION_ERROR = "AUTHORIZATION_ERROR",

  NOT_FOUND_ERROR = "NOT_FOUND_ERROR",

  CONFLICT_ERROR = "CONFLICT_ERROR",

  EXECUTION_REJECTED = "EXECUTION_REJECTED",

  VERIFICATION_ERROR = "VERIFICATION_ERROR",

  REPLAY_ERROR = "REPLAY_ERROR",

  NETWORK_ERROR = "NETWORK_ERROR",

  TIMEOUT_ERROR = "TIMEOUT_ERROR",

  RATE_LIMIT_ERROR = "RATE_LIMIT_ERROR",

  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
}

/**
 * Options used to construct a ParmanaError.
 */
export interface ParmanaErrorOptions {
  readonly code: ErrorCode;

  readonly message: string;

  readonly requestId?: string;

  readonly cause?: unknown;
}

/**
 * Canonical SDK base error.
 */
export class ParmanaError extends Error {
  /**
   * Stable machine-readable error code.
   */
  public readonly code: ErrorCode;

  /**
   * Optional request identifier.
   */
  public readonly requestId?: string;

  /**
   * Optional underlying cause.
   */
  public readonly cause?: unknown;

  /**
   * The HTTP status of the response this error was made from, for example
   * 403 or 503. Absent when no response was received (a network error or
   * a timeout) and for errors raised by the SDK itself. The Python SDK's
   * equivalent is `status_code`.
   */
  public readonly statusCode?: number;

  /**
   * Creates a ParmanaError.
   */
  constructor(options: ParmanaErrorOptions) {
    super(options.message);

    this.name = "ParmanaError";

    this.code = options.code;

    if (options.requestId !== undefined) {
      this.requestId = options.requestId;
    }

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
