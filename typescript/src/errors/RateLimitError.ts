import { ErrorCode, ParmanaError } from "./ParmanaError.js";

/**
 * Raised when the Runtime returns HTTP 429: the caller has exceeded the
 * per-identity rate limit on POST /execute, or the IP-keyed limit on
 * GET /health,/ready (see packages/api's rate-limiting middleware).
 * Distinct from every other 4xx this SDK maps -- it is not a request
 * defect, it is a transient condition the caller should back off and
 * retry, so `retryAfterSeconds` (parsed from the response's
 * `Retry-After` header, when present) is exposed for callers that want
 * to honor the Runtime's own hint rather than guess a delay.
 */
export class RateLimitError extends ParmanaError {
  /**
   * Seconds to wait before retrying, taken from the response's
   * `Retry-After` header. Undefined when the Runtime didn't send one.
   */
  public readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    options?: {
      requestId?: string;
      cause?: unknown;
      retryAfterSeconds?: number;
    },
  ) {
    super({
      code: ErrorCode.RATE_LIMIT_ERROR,

      message,

      ...(options?.requestId !== undefined && {
        requestId: options.requestId,
      }),

      ...(options?.cause !== undefined && {
        cause: options.cause,
      }),
    });

    this.name = "RateLimitError";

    if (options?.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }
}
