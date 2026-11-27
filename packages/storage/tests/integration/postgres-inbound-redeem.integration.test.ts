import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresInboundCheckRepository } from "../../src/postgres/PostgresInboundCheckRepository.js";
import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * Redemption of an inbound check decision, once, against a real Postgres database. Every row carries a run
 * tag and is deleted afterwards. Reads TEST_DATABASE_URL; skipped when it is unset.
 */
const url = process.env.TEST_DATABASE_URL?.trim();

const suite = resolveDatabaseGate("inbound redemption")
  ? describe
  : describe.skip;

suite("PostgresInboundCheckRepository.redeem", () => {
  const run = randomUUID().replace(/-/g, "");
  let pool: pg.Pool;
  let repo: PostgresInboundCheckRepository;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: 2 });
    repo = new PostgresInboundCheckRepository(pool);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(
      "DELETE FROM consumed_approval_nonces WHERE nonce LIKE $1",
      [`redeem:it-${run}-%`],
    );
    await pool.end();
  });

  it("returns true the first time and false on a second redemption of the same decision", async () => {
    const id = `it-${run}-a`;
    const expiresAt = new Date(Date.now() + 600_000).toISOString();
    expect(await repo.redeem(id, expiresAt)).toBe(true);
    expect(await repo.redeem(id, expiresAt)).toBe(false);
  });

  it("redeems two different decisions independently", async () => {
    const expiresAt = new Date(Date.now() + 600_000).toISOString();
    expect(await repo.redeem(`it-${run}-b1`, expiresAt)).toBe(true);
    expect(await repo.redeem(`it-${run}-b2`, expiresAt)).toBe(true);
  });
});
