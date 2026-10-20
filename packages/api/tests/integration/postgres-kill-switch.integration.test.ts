import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PostgresKillSwitchStore } from "../../src/killSwitch/PostgresKillSwitchStore.js";
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

  beforeEach(async () => {
    await pool.query(`
      update kill_switch_state
      set active = false, version = 0, tripped_by = null, tripped_at = null,
          trip_reason = null, reset_by = null, reset_at = null, reset_reason = null
      where id = 1
    `);
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
    await new KillSwitchService(new PostgresKillSwitchStore(pool)).trip(
      "operator-a",
      "before restart",
    );

    const afterRestart = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    try {
      const state = await new KillSwitchService(
        new PostgresKillSwitchStore(afterRestart),
      ).state();

      expect(state.active).toBe(true);
      expect(state.tripReason).toBe("before restart");
      expect(state.trippedBy).toBe("operator-a");
    } finally {
      await afterRestart.end();
    }
  });

  it("does not lose an update when two operators trip at once", async () => {
    const first = new KillSwitchService(new PostgresKillSwitchStore(pool));
    const second = new KillSwitchService(new PostgresKillSwitchStore(pool));

    await Promise.all([
      first.trip("operator-a", "one"),
      second.trip("operator-b", "two"),
    ]);

    const state = await new PostgresKillSwitchStore(pool).read();

    expect(state.active).toBe(true);
    expect(state.version).toBe(2);
  });
});
