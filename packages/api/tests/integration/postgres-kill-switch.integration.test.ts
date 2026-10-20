import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  PostgresKillSwitchProbeLog,
  PostgresKillSwitchStore,
} from "../../src/killSwitch/PostgresKillSwitchStore.js";
import { KillSwitchService } from "../../src/killSwitch/KillSwitchService.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * The durable kill switch store against a real Postgres (ADR-0017, step 1).
 * Gated like the other DATABASE_URL suites. Each case resets the single row,
 * so run this against a test database only.
 */
const databaseConfigured = resolveDatabaseGate("Postgres kill switch");

describe.skipIf(!databaseConfigured)("PostgresKillSwitchStore (live)", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const ONE_OPERATOR = {
    resetNeedsSecondOperator: false,
    probes: new PostgresKillSwitchProbeLog(pool),
  };

  beforeEach(async () => {
    await pool.query(`
      update kill_switch_state
      set active = false, version = 0, tripped_by = null, tripped_at = null,
          trip_reason = null, pending_reset_by = null, pending_reset_at = null,
          pending_reset_reason = null, reset_requested_by = null, reset_by = null,
          reset_at = null, reset_reason = null
      where id = 1
    `);
    await pool.query("delete from kill_switch_probe");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("reads the seeded state: not tripped, version 0", async () => {
    const state = await new PostgresKillSwitchStore(pool).read();

    expect(state.active).toBe(false);
    expect(state.version).toBe(0);
  });

  it("writes only from the version it read, and refuses a stale write", async () => {
    const store = new PostgresKillSwitchStore(pool);
    const current = await store.read();

    const tripped = await store.compareAndWrite(current.version, {
      active: true,
      version: current.version + 1,
      trippedBy: "operator-a",
      trippedAt: new Date().toISOString(),
      tripReason: "first",
    });
    expect(tripped).toBe(true);

    const stale = await store.compareAndWrite(current.version, {
      active: false,
      version: current.version + 1,
      resetBy: "operator-b",
      resetAt: new Date().toISOString(),
      resetReason: "stale",
    });
    expect(stale).toBe(false);

    expect((await store.read()).active).toBe(true);
  });

  it("keeps a trip across a restart: a new pool and store read the same trip", async () => {
    await new KillSwitchService(
      new PostgresKillSwitchStore(pool),
      ONE_OPERATOR,
    ).trip("operator-a", "before restart");

    const afterRestart = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    try {
      const state = await new KillSwitchService(
        new PostgresKillSwitchStore(afterRestart),
        ONE_OPERATOR,
      ).state();

      expect(state.active).toBe(true);
      expect(state.tripReason).toBe("before restart");
      expect(state.trippedBy).toBe("operator-a");
    } finally {
      await afterRestart.end();
    }
  });

  it("does not lose an update when two operators trip at once", async () => {
    const first = new KillSwitchService(
      new PostgresKillSwitchStore(pool),
      ONE_OPERATOR,
    );
    const second = new KillSwitchService(
      new PostgresKillSwitchStore(pool),
      ONE_OPERATOR,
    );

    await Promise.all([
      first.trip("operator-a", "one"),
      second.trip("operator-b", "two"),
    ]);

    const state = await new PostgresKillSwitchStore(pool).read();

    expect(state.active).toBe(true);
    expect(state.version).toBe(2);
  });

  it("holds a two-person reset across a restart and completes it with the second operator", async () => {
    const options = {
      resetNeedsSecondOperator: true,
      probes: new PostgresKillSwitchProbeLog(pool),
    };
    await new KillSwitchService(
      new PostgresKillSwitchStore(pool),
      options,
    ).trip("operator-a", "two person");
    await new KillSwitchService(
      new PostgresKillSwitchStore(pool),
      options,
    ).reset("operator-b", "first");

    const afterRestart = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    try {
      const pending = await new KillSwitchService(
        new PostgresKillSwitchStore(afterRestart),
        options,
      ).state();
      expect(pending.pendingResetBy).toBe("operator-b");
      expect(pending.active).toBe(true);

      const done = await new KillSwitchService(
        new PostgresKillSwitchStore(afterRestart),
        options,
      ).reset("operator-c", "second");
      expect(done.outcome).toBe("reset");
      expect(done.state.resetRequestedBy).toBe("operator-b");
    } finally {
      await afterRestart.end();
    }
  });

  it("records a probe result in kill_switch_probe", async () => {
    const probes = new PostgresKillSwitchProbeLog(pool);
    const service = new KillSwitchService(new PostgresKillSwitchStore(pool), {
      resetNeedsSecondOperator: false,
      probes,
    });
    await service.trip("operator-a", "probe");

    const probe = await service.recordProbe("scheduler", {
      status: 503,
      errorCode: "KILL_SWITCH_ACTIVE",
    });

    const { rows } = await pool.query(
      "select recorded_by, refused, passed, switch_version from kill_switch_probe",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recorded_by: "scheduler",
      refused: true,
      passed: true,
      switch_version: 1,
    });
    expect(probe.passed).toBe(true);
  });
});
