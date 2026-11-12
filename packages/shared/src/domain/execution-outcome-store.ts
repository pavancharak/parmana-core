import type { ExecutionResult } from "./execution-result.js";

/**
 * What is recorded about one authorization's execution, keyed by its nonce.
 *
 * - `in_flight`: the nonce was consumed and the connector was (or may have
 *   been) called, but no result was recorded. The effect may or may not have
 *   happened. A retry must not execute again and must not assume either way.
 * - `completed`: the connector returned. A retry returns this result without
 *   calling the connector again.
 * - `failed`: the authorization's nonce was consumed, but the release was
 *   refused before the connector was called. Nothing ran. A retry is refused
 *   with the recorded reason, and the authorization must be replaced.
 */
export type ExecutionOutcome =
  | { readonly status: "in_flight" }
  | { readonly status: "completed"; readonly result: ExecutionResult }
  | { readonly status: "failed"; readonly reason: string };

/**
 * Records the outcome of each authorization so a retry after a lost response
 * can recover it instead of being refused with no information.
 *
 * Gap G-125 (docs/internal/VERIFICATION-GAPS.md). Single use (the nonce) still decides
 * whether an authorization may execute. This store records what happened
 * when it did.
 *
 * Implementations must make `begin` atomic: the first caller for a nonce gets
 * `true`, every later caller gets `false`, even under concurrent calls. A
 * nonce with no row is treated as unknown by callers.
 */
export interface ExecutionOutcomeStore {
  /**
   * Creates an `in_flight` row for the nonce unless one already exists.
   * Returns true if this call created it.
   */
  begin(nonce: string, expiresAt: string): Promise<boolean>;

  /**
   * Records the connector's result for a nonce whose row is `in_flight`.
   * Throws if no in-flight row exists, so a missing record is never silent.
   */
  complete(nonce: string, result: ExecutionResult): Promise<void>;

  /**
   * Records that the release was refused before the connector ran, for a
   * nonce whose row is `in_flight`. Throws if no in-flight row exists.
   */
  fail(nonce: string, reason: string): Promise<void>;

  /**
   * Deletes the `in_flight` row for a nonce whose release was refused before
   * the nonce was consumed, so that a corrected retry can be released. Only an
   * in-flight row is deleted; a completed or failed row is never removed.
   */
  abort(nonce: string): Promise<void>;

  /** Returns the recorded outcome, or undefined when none is recorded. */
  get(nonce: string): Promise<ExecutionOutcome | undefined>;

  /**
   * Read only. Lists rows still `in_flight` whose authorization expired at or
   * before `now`. These are the only rows the reconciler may consider, because
   * a retry can no longer arrive for them. Changes nothing.
   */
  listStuck(now: Date): Promise<readonly StuckExecutionOutcome[]>;
}

/** An in-flight outcome whose authorization has expired. */
export interface StuckExecutionOutcome {
  readonly nonce: string;
  readonly expiresAt: string;
}

/**
 * Restores an ExecutionResult read back from storage. A stored result is JSON,
 * so `executedAt` comes back as a string. Every store uses this so a replayed
 * result has the same shape whichever store recorded it.
 */
export function reviveExecutionResult(raw: unknown): ExecutionResult {
  const result = raw as ExecutionResult;

  return { ...result, executedAt: new Date(result.executedAt) };
}
