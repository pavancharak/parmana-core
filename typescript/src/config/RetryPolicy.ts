/**
 * Parmana SDK
 *
 * Canonical retry policy.
 *
 * A RetryPolicy controls how the SDK retries transient
 * communication failures when interacting with the
 * Parmana Runtime.
 *
 * RetryPolicy does NOT change Runtime behavior.
 * It affects only SDK communication.
 */

/**
 * Retry backoff strategy.
 */
export enum RetryStrategy {
  /**
   * Constant delay between retry attempts.
   */
  FIXED = "FIXED",

  /**
   * Exponential backoff.
   */
  EXPONENTIAL = "EXPONENTIAL",
}

/**
 * Immutable retry configuration.
 */
export interface RetryPolicy {
  /**
   * Enables or disables retries.
   *
   * Default:
   * false
   */
  readonly enabled?: boolean;

  /**
   * Maximum retry attempts.
   *
   * Default:
   * 0
   */
  readonly maxAttempts?: number;

  /**
   * Initial retry delay in milliseconds.
   *
   * Default:
   * 1000
   */
  readonly initialDelayMs?: number;

  /**
   * Maximum delay between retries.
   *
   * Default:
   * 30000
   */
  readonly maxDelayMs?: number;

  /**
   * Retry backoff strategy.
   *
   * Default:
   * EXPONENTIAL
   */
  readonly strategy?: RetryStrategy;
}
