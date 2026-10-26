import type { Pool } from "pg";

/**
 * Retention for kill_switch_probe (ADR-0017, decision 3): probe history is kept
 * for at least one year. A row may be deleted only once it is that old, never
 * before. The guard below decides the cutoff, and the pruner runs only after the
 * guard has accepted it.
 */

export const PROBE_RETENTION_MIN_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The newest instant a probe may be deleted before: exactly one year before now. */
export function probeRetentionCutoff(now: Date): Date {
  return new Date(now.getTime() - PROBE_RETENTION_MIN_DAYS * DAY_MS);
}

/** Throws unless every probe before `cutoff` is at least one year old. */
export function assertPruneCutoffAllowed(cutoff: Date, now: Date): void {
  if (Number.isNaN(cutoff.getTime())) {
    throw new Error("Prune cutoff is not a valid date.");
  }

  if (cutoff.getTime() > probeRetentionCutoff(now).getTime()) {
    throw new Error(
      `Refusing to delete probes younger than ${PROBE_RETENTION_MIN_DAYS} days.`,
    );
  }
}

const DELETE_BEFORE_SQL = `
  delete from kill_switch_probe
  where probed_at < $1
`;

/** Deletes probes older than a cutoff that the retention guard has accepted. */
export class PostgresKillSwitchProbePruner {
  constructor(private readonly pool: Pool) {}

  /** Returns how many probes were deleted. Throws, deleting nothing, if the cutoff is too recent. */
  async pruneBefore(cutoff: Date, now: Date = new Date()): Promise<number> {
    assertPruneCutoffAllowed(cutoff, now);

    const result = await this.pool.query(DELETE_BEFORE_SQL, [cutoff]);

    return result.rowCount ?? 0;
  }
}
