import type { Decision } from "@parmana/shared";

/**
 * Result of deterministic replay.
 *
 * Replay never modifies the original execution.
 * It re-executes the same policy against the same
 * transaction and compares the resulting Decision.
 */
export interface ReplayResult {
  /**
   * Decision recorded during the original execution.
   */
  readonly recordedDecision: Decision;

  /**
   * Decision produced during replay.
   */
  readonly replayedDecision: Decision;

  /**
   * True when the replayed Decision matches the
   * recorded Decision.
   */
  readonly matches: boolean;

  /**
   * Optional explanation when replay fails.
   */
  readonly message?: string;

  /**
   * UTC timestamp when replay completed.
   */
  readonly replayedAt: Date;
}
