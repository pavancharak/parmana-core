import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resolveDatabaseGate } from "../../../../test-support/database-gate.js";
import { PolicyV2NonceStore } from "../../src/v2/persistence.js";

/** Durable nonces for policy version 2 against a real database (plan 4.5 and 4.6). */

const databaseConfigured = resolveDatabaseGate("Policy v2 nonces");
const NOW = new Date("2026-11-18T09:00:00.000Z");
const LATER = "2026-11-18T09:15:00.000Z";
const EARLIER = "2026-11-18T08:59:00.000Z";

describe.skipIf(!databaseConfigured)("policy v2 nonces (live database)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE policy_v2_nonces");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("accepts a nonce once and refuses the second use", async () => {
    const store = new PolicyV2NonceStore(pool, () => NOW);
    expect(await store.consume("n-1", LATER)).toBe(true);
    expect(await store.consume("n-1", LATER)).toBe(false);
  });

  it("refuses a nonce used through another store on the same database", async () => {
    const first = new PolicyV2NonceStore(pool, () => NOW);
    const second = new PolicyV2NonceStore(pool, () => NOW);
    expect(await first.consume("n-2", LATER)).toBe(true);
    expect(await second.consume("n-2", LATER)).toBe(false);
  });

  it("lets exactly one of many simultaneous uses of a nonce succeed", async () => {
    const store = new PolicyV2NonceStore(pool, () => NOW);
    const results = await Promise.all(
      Array.from({ length: 12 }, () => store.consume("n-3", LATER)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("removes nonces past their expiry, and keeps the rest", async () => {
    const clock = { now: new Date("2026-11-18T08:58:00.000Z") };
    const store = new PolicyV2NonceStore(pool, () => clock.now);
    await store.consume("expired", EARLIER);
    await store.consume("live", LATER);

    clock.now = NOW;
    await store.consume("another", LATER);

    const rows = await pool.query<{ nonce: string }>(
      "SELECT nonce FROM policy_v2_nonces ORDER BY nonce",
    );
    expect(rows.rows.map((r) => r.nonce)).toEqual(["another", "live"]);
  });
});
