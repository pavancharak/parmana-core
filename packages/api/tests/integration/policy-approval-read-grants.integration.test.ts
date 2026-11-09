import { describe, expect, it } from "vitest";

import { PostgresPoolFactory } from "@parmana/storage";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * Migration 20261110130000_policy_approval_reads_for_reader_role_only.sql: the public
 * anon role cannot read policy_change_approval_records, and the policy reader group
 * role can. Both are checked by switching role inside a transaction that is rolled back.
 */
const databaseConfigured = resolveDatabaseGate("Policy approval read grants");

describe.skipIf(!databaseConfigured)("policy approval reads (live)", () => {
  it("denies SELECT to anon", async () => {
    const pool = PostgresPoolFactory.create();
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        "SELECT to_regrole('anon') IS NOT NULL AS present",
      );
      if (!rows[0].present) return; // a plain database may have no anon role at all

      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE anon");
      await expect(
        client.query("SELECT 1 FROM policy_change_approval_records LIMIT 1"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("allows SELECT to the policy reader group role", async () => {
    const pool = PostgresPoolFactory.create();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE parmana_policy_reader");
      await expect(
        client.query("SELECT count(*) FROM policy_change_approval_records"),
      ).resolves.toBeDefined();
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});
