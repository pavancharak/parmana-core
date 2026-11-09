import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresApprovalNonceStore } from "../../src/postgres/PostgresApprovalNonceStore.js";
import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * G-143: removing expired approval nonces. Runs against a real database with the migrations applied. Rows carry a
 * run tag and are deleted afterwards. Reads TEST_DATABASE_URL only; skipped when it is not set. The
 * target is validated by vitest.setup.ts before this file runs.
 */
const url = process.env.TEST_DATABASE_URL?.trim();

const suite = resolveDatabaseGate("G-143 nonce cleanup")
  ? describe
  : describe.skip;

suite("PostgresApprovalNonceStore.deleteExpired (G-143)", () => {
  const run = randomUUID().replace(/-/g, "");
  let pool: pg.Pool;
  let store: PostgresApprovalNonceStore;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: 2 });
    store = new PostgresApprovalNonceStore(pool);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(
      "DELETE FROM consumed_approval_nonces WHERE nonce LIKE $1",
      [`it-${run}-%`],
    );
    await pool.end();
  });

  async function exists(nonce: string): Promise<boolean> {
    const { rows } = await pool.query(
      "SELECT 1 FROM consumed_approval_nonces WHERE nonce = $1",
      [nonce],
    );
    return rows.length > 0;
  }

  it("removes a nonce whose approval has expired, and keeps one whose approval is still valid", async () => {
    const expired = `it-${run}-expired`;
    const current = `it-${run}-current`;
    await store.checkAndRecord(expired, "2020-01-01T00:00:00.000Z");
    await store.checkAndRecord(current, "2099-01-01T00:00:00.000Z");

    const removed = await store.deleteExpired(new Date());

    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await exists(expired)).toBe(false);
    expect(await exists(current)).toBe(true);
  });

  it("removes nothing when no nonce has expired before the given time", async () => {
    const future = `it-${run}-future`;
    await store.checkAndRecord(future, "2099-06-01T00:00:00.000Z");

    await store.deleteExpired(new Date("2000-01-01T00:00:00.000Z"));

    expect(await exists(future)).toBe(true);
  });
});
