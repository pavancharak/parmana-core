import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";

import pg from "pg";
import { describe, expect, it } from "vitest";

/**
 * Regression test: the migrations apply to a database that already holds
 * caller audit rows of every event type.
 *
 * A local volume written by newer code holds rows of types that an older
 * migration's CHECK constraint does not list. Adding such a constraint as a
 * validated CHECK then fails, and every later migration is blocked. The fix
 * adds the constraint with NOT VALID in each migration that rewrites it. This
 * test seeds a database the way an old volume looks, applies the rest of the
 * migrations, and checks that the rows are kept and new bad rows are refused.
 *
 * Creates and drops its own database, so it never touches the database the
 * other suites use. Runs only when TEST_DATABASE_URL is set and
 * ALLOW_LIVE_SUPABASE=1 is set, the same opt-in as the other database suites.
 */

const enabled =
  Boolean(process.env.TEST_DATABASE_URL?.trim()) &&
  process.env.ALLOW_LIVE_SUPABASE === "1";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const migrationsDir = join(repoRoot, "supabase", "migrations");
const rolesFile = join(repoRoot, "docker", "local", "postgres-roles.sql");

/** The first migration that rewrites caller_audit_events_type_check. */
const CUT = "20260812120000_add_capability_to_caller_audit_events.sql";

const OLD_EVENT_TYPES = [
  "caller.authenticated",
  "caller.rejected",
  "caller.principal_denied",
  "caller.capability_denied",
  "caller.capability_granted",
];

function databaseUrlFor(base: string, database: string): string {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
}

async function applyMigration(client: pg.Client, name: string, sql: string) {
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error(`${name} failed: ${String(error)}`, { cause: error });
  }
}

(enabled ? describe : describe.skip)(
  "migrations apply to a database that holds old audit rows",
  () => {
    it("keeps the old rows, applies every migration, and still refuses unknown types", async () => {
      const base = process.env.TEST_DATABASE_URL as string;
      const database = `migrations_old_data_${process.pid}_${Date.now()}`;

      const admin = new pg.Client({ connectionString: base });
      await admin.connect();
      await admin.query(`CREATE DATABASE ${database}`);

      const client = new pg.Client({
        connectionString: databaseUrlFor(base, database),
      });
      await client.connect();

      try {
        // Roles the migrations expect, as migrate.sh creates them.
        await client.query(readFileSync(rolesFile, "utf8"));

        const files = readdirSync(migrationsDir)
          .filter((name) => name.endsWith(".sql"))
          .sort();
        const before = files.filter((name) => name < CUT);
        const after = files.filter((name) => name >= CUT);

        for (const name of before) {
          await applyMigration(
            client,
            name,
            readFileSync(join(migrationsDir, name), "utf8"),
          );
        }

        // An old volume: the type constraint is gone, and rows of types the
        // later migrations list are already present.
        await client.query(
          "ALTER TABLE caller_audit_events DROP CONSTRAINT IF EXISTS caller_audit_events_type_check",
        );
        for (const type of OLD_EVENT_TYPES) {
          await client.query(
            "INSERT INTO caller_audit_events (type, occurred_at, route, caller_id, reason) VALUES ($1, now(), '/execute', 'demo', NULL)",
            [type],
          );
        }

        for (const name of after) {
          await applyMigration(
            client,
            name,
            readFileSync(join(migrationsDir, name), "utf8"),
          );
        }

        const kept = await client.query(
          "SELECT count(*)::int AS n FROM caller_audit_events",
        );
        expect(kept.rows[0].n).toBe(OLD_EVENT_TYPES.length);

        await expect(
          client.query(
            "INSERT INTO caller_audit_events (type, occurred_at, route) VALUES ('caller.not_a_real_type', now(), '/x')",
          ),
        ).rejects.toThrow(/check constraint/);
      } finally {
        await client.end();
        await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
        await admin.end();
      }
    }, 120_000);
  },
);
