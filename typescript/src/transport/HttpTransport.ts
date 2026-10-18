/**
 * Parmana SDK
 *
 * Canonical HTTP transport.
 *
 * Responsibilities:
 * - Send HTTP requests.
 * - Serialize request bodies.
 * - Deserialize responses.
 * - Return canonical TransportResponse objects.
 *
 * This transport does NOT:
 * - evaluate policy
 * - authorize execution
 * - implement business logic
 */

import type {
  Transport,
  TransportRequest,
  TransportResponse,
} from "../config/Transport.js";

import type { Configuration } from "../config/Configuration.js";

import { RetryStrategy, type RetryPolicy } from "../config/RetryPolicy.js";

import { ParmanaError } from "../errors/ParmanaError.js";

import { NetworkError } from "../errors/NetworkError.js";

import { TimeoutError } from "../errors/TimeoutError.js";

import { InternalServerError } from "../errors/InternalServerError.js";

import { RateLimitError } from "../errors/RateLimitError.js";

import { mapHttpErrorResponse } from "./mapHttpErrorResponse.js";

/**
 * Retries are restricted to idempotent methods only. A retried POST
 * (e.g. /execute) risks a second real side effect on the underlying
 * system if the first attempt actually succeeded but the response was
 * lost -- the server's own businessTransactionId uniqueness check turns
 * that into a 409, not a duplicate execution, but blindly retrying
 * non-idempotent requests is still not a safe default without deliberate
 * per-route design this SDK doesn't have. Mirrors the Python SDK's own
 * documented choice (urllib3 Retry scoped to GET only).
 */
const RETRYABLE_METHODS: readonly TransportRequest["method"][] = ["GET"];

/**
 * Every 5xx this API can return for a GET request maps to
 * InternalServerError (mapHttpErrorResponse.ts only special-cases 4xx
 * statuses individually) -- so "retryable HTTP failure" is exactly
 * "InternalServerError on a GET", no separate status-code bookkeeping
 * needed. Network failures and timeouts are retryable regardless of
 * which HTTP status (if any) was ever reached. RateLimitError (429) is
 * retryable too -- GET /health,/ready are IP-rate-limited (see
 * packages/api's rate-limiting middleware) and a caller polling them on
 * a fixed interval should be able to just wait out the window rather
 * than handling 429 specially. POST /execute is also rate-limited, but
 * RETRYABLE_METHODS already excludes POST for the unrelated
 * non-idempotency reason above, so this doesn't risk a double-submit.
 * Note: retry timing here still follows the configured backoff
 * (delayForAttempt below), not RateLimitError.retryAfterSeconds -- the
 * Runtime's hint is exposed on the error for a caller that wants to
 * honor it directly, but isn't yet wired into this loop's own delay.
 */
function isRetryableFailure(error: unknown): boolean {
  return (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof InternalServerError ||
    error instanceof RateLimitError
  );
}

function delayForAttempt(
  attempt: number,
  policy: {
    readonly initialDelayMs: number;
    readonly maxDelayMs: number;
    readonly strategy: RetryStrategy;
  },
): number {
  const raw =
    policy.strategy === RetryStrategy.FIXED
      ? policy.initialDelayMs
      : policy.initialDelayMs * 2 ** attempt;

  return Math.min(raw, policy.maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolves the effective retry policy for a request, or undefined when
 * retries do not apply at all -- disabled, no configuration.retryPolicy,
 * maxAttempts <= 0 (the documented default), or a non-idempotent method.
 * Every field below mirrors RetryPolicy.ts's own documented defaults.
 */
function resolveRetryPolicy(
  configuration: Configuration,
  method: TransportRequest["method"],
):
  | {
      readonly maxAttempts: number;
      readonly initialDelayMs: number;
      readonly maxDelayMs: number;
      readonly strategy: RetryStrategy;
    }
  | undefined {
  const policy: RetryPolicy | undefined = configuration.retryPolicy;

  if (policy?.enabled !== true) {
    return undefined;
  }

  const maxAttempts = policy.maxAttempts ?? 0;

  if (maxAttempts <= 0) {
    return undefined;
  }

  if (!RETRYABLE_METHODS.includes(method)) {
    return undefined;
  }

  return {
    maxAttempts,
    initialDelayMs: policy.initialDelayMs ?? 1000,
    maxDelayMs: policy.maxDelayMs ?? 30_000,
    strategy: policy.strategy ?? RetryStrategy.EXPONENTIAL,
  };
}

export class HttpTransport implements Transport {
  constructor(private readonly configuration: Configuration) {}

  public async send<T>(
    request: TransportRequest,
  ): Promise<TransportResponse<T>> {
    const retryPolicy = resolveRetryPolicy(this.configuration, request.method);

    if (retryPolicy === undefined) {
      return this.attempt<T>(request);
    }

    // maxAttempts counts retries, not the initial try -- maxAttempts: 3
    // means up to 4 total requests (1 initial + 3 retries), matching
    // RetryPolicy.ts's own doc comment ("Maximum retry attempts").
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.attempt<T>(request);
      } catch (error) {
        const canRetry =
          isRetryableFailure(error) && attempt < retryPolicy.maxAttempts;

        if (!canRetry) {
          throw error;
        }

        await sleep(delayForAttempt(attempt, retryPolicy));
      }
    }
  }

  private async attempt<T>(
    request: TransportRequest,
  ): Promise<TransportResponse<T>> {
    const controller = new AbortController();

    const timeout = this.configuration.timeout ?? 30_000;

    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const init: RequestInit = {
        method: request.method,

        headers: {
          "Content-Type": "application/json",

          ...(this.configuration.apiKey !== undefined && {
            Authorization: `Bearer ${this.configuration.apiKey}`,
          }),

          ...(this.configuration.userAgent !== undefined && {
            "User-Agent": this.configuration.userAgent,
          }),

          ...(request.headers ?? {}),
        },

        signal: controller.signal,
      };

      if (request.body !== undefined) {
        init.body = JSON.stringify(request.body);
      }

      const response = await fetch(
        this.configuration.endpoint + request.path,
        init,
      );

      clearTimeout(timer);

      const headers: Record<string, string> = {};

      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      let body: T;

      if (response.status === 204) {
        body = undefined as T;
      } else {
        try {
          body = (await response.json()) as T;
        } catch {
          // A non-JSON or empty body. Real, error-envelope
          // responses from this API are always JSON; this only
          // guards mapHttpErrorResponse below against an
          // unparseable body rather than throwing an opaque
          // SyntaxError for it.
          body = undefined as T;
        }
      }

      if (
        response.status >= 400 &&
        !(request.nonThrowingStatuses ?? []).includes(response.status)
      ) {
        throw mapHttpErrorResponse(response.status, body, headers);
      }

      return {
        status: response.status,

        headers,

        body,
      };
    } catch (error) {
      clearTimeout(timer);

      if (error instanceof ParmanaError) {
        // Already the correct typed error (mapHttpErrorResponse,
        // above) — rethrow as-is, do not fold it into NetworkError.
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new TimeoutError("Request timed out.");
      }

      throw new NetworkError(
        "Unable to communicate with the Parmana Runtime.",
        {
          cause: error,
        },
      );
    }
  }
}
