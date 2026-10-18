/**
 * Parmana SDK
 *
 * Canonical SDK configuration.
 *
 * Configuration defines how the SDK communicates with
 * the Parmana Runtime.
 *
 * Configuration does NOT define:
 * - policy behavior
 * - runtime behavior
 * - authorization rules
 * - execution behavior
 * - verification behavior
 */

import type { RetryPolicy } from "./RetryPolicy.js";
import type { Transport } from "./Transport.js";

/**
 * Immutable SDK configuration.
 *
 * The Parmana Runtime gates every route except GET /health, GET /ready,
 * GET /openapi.yaml, and GET /documentation behind a caller bearer key
 * (packages/api/src/middleware/caller-auth.ts). See apiKey below and
 * /api-reference/authentication.
 */
export interface Configuration {
  /**
   * Parmana Runtime endpoint.
   *
   * Example:
   * https://runtime.example.com
   */
  readonly endpoint: string;

  /**
   * Caller bearer key, minted by scripts/generate-api-key.ts.
   *
   * Sent as `Authorization: Bearer <apiKey>` on every request. Omit only
   * against a Runtime started with PARMANA_AUTH_DISABLED=true (local
   * development only); every other deployment rejects an unauthenticated
   * request with a 401 before a Business Transaction is even
   * constructed.
   */
  readonly apiKey?: string;

  /**
   * Request timeout (milliseconds).
   *
   * Default:
   * 30000
   */
  readonly timeout?: number;

  /**
   * Retry configuration.
   */
  readonly retryPolicy?: RetryPolicy;

  /**
   * Transport implementation.
   *
   * If omitted, the client builds an HttpTransport from this same configuration, so timeout, retryPolicy, apiKey and userAgent apply.
   */
  readonly transport?: Transport;

  /**
   * Optional SDK user agent.
   */
  readonly userAgent?: string;
}
