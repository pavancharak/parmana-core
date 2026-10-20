import type { Pool } from "pg";

import type {
  KillSwitchProbe,
  KillSwitchProbeLog,
  KillSwitchState,
  KillSwitchStore,
} from "./KillSwitchService.js";

/**
 * The durable kill switch store (ADR-0017). The state lives in one row of
 * kill_switch_state. A write changes the row only if its version is still the
 * one the caller read, so a stale write fails instead of overwriting.
 */

const SELECT_SQL = `
  select active, version, tripped_by, tripped_at, trip_reason,
         pending_reset_by, pending_reset_at, pending_reset_reason,
         reset_requested_by, reset_by, reset_at, reset_reason
  from kill_switch_state
  where id = 1
`;

const UPDATE_SQL = `
  update kill_switch_state
  set active = $3,
      version = $2,
      tripped_by = $4,
      tripped_at = $5,
      trip_reason = $6,
      pending_reset_by = $10,
      pending_reset_at = $11,
      pending_reset_reason = $12,
      reset_requested_by = $13,
      reset_by = $7,
      reset_at = $8,
      reset_reason = $9,
      updated_at = now()
  where id = 1 and version = $1
`;

interface KillSwitchRow {
  readonly active: boolean;
  readonly version: number;
  readonly tripped_by: string | null;
  readonly tripped_at: Date | null;
  readonly trip_reason: string | null;
  readonly pending_reset_by: string | null;
  readonly pending_reset_at: Date | null;
  readonly pending_reset_reason: string | null;
  readonly reset_requested_by: string | null;
  readonly reset_by: string | null;
  readonly reset_at: Date | null;
  readonly reset_reason: string | null;
}

function toState(row: KillSwitchRow): KillSwitchState {
  return {
    active: row.active,
    version: row.version,
    ...(row.tripped_by !== null ? { trippedBy: row.tripped_by } : {}),
    ...(row.tripped_at !== null
      ? { trippedAt: row.tripped_at.toISOString() }
      : {}),
    ...(row.trip_reason !== null ? { tripReason: row.trip_reason } : {}),
    ...(row.pending_reset_by !== null
      ? { pendingResetBy: row.pending_reset_by }
      : {}),
    ...(row.pending_reset_at !== null
      ? { pendingResetAt: row.pending_reset_at.toISOString() }
      : {}),
    ...(row.pending_reset_reason !== null
      ? { pendingResetReason: row.pending_reset_reason }
      : {}),
    ...(row.reset_requested_by !== null
      ? { resetRequestedBy: row.reset_requested_by }
      : {}),
    ...(row.reset_by !== null ? { resetBy: row.reset_by } : {}),
    ...(row.reset_at !== null ? { resetAt: row.reset_at.toISOString() } : {}),
    ...(row.reset_reason !== null ? { resetReason: row.reset_reason } : {}),
  };
}

export class PostgresKillSwitchStore implements KillSwitchStore {
  constructor(private readonly pool: Pool) {}

  async read(): Promise<KillSwitchState> {
    const { rows } = await this.pool.query<KillSwitchRow>(SELECT_SQL);
    const row = rows[0];

    if (row === undefined) {
      throw new Error(
        "kill_switch_state has no row. Apply the kill switch migration.",
      );
    }

    return toState(row);
  }

  async compareAndWrite(
    expectedVersion: number,
    next: KillSwitchState,
  ): Promise<boolean> {
    const result = await this.pool.query(UPDATE_SQL, [
      expectedVersion,
      next.version,
      next.active,
      next.trippedBy ?? null,
      next.trippedAt ?? null,
      next.tripReason ?? null,
      next.resetBy ?? null,
      next.resetAt ?? null,
      next.resetReason ?? null,
      next.pendingResetBy ?? null,
      next.pendingResetAt ?? null,
      next.pendingResetReason ?? null,
      next.resetRequestedBy ?? null,
    ]);

    return (result.rowCount ?? 0) === 1;
  }
}

const INSERT_PROBE_SQL = `
  insert into kill_switch_probe (
    probed_at, recorded_by, switch_active, switch_version,
    observed_status, observed_error_code, refused, passed
  )
  values ($1, $2, $3, $4, $5, $6, $7, $8)
`;

/** Probe results, kept in kill_switch_probe (ADR-0017, decision 3). */
export class PostgresKillSwitchProbeLog implements KillSwitchProbeLog {
  constructor(private readonly pool: Pool) {}

  async record(probe: KillSwitchProbe): Promise<void> {
    await this.pool.query(INSERT_PROBE_SQL, [
      probe.probedAt,
      probe.recordedBy,
      probe.switchActive,
      probe.switchVersion,
      probe.observedStatus,
      probe.observedErrorCode ?? null,
      probe.refused,
      probe.passed,
    ]);
  }
}
