import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

/**
 * Runs deploy/sandbox/retention.sql against real Postgres (PGlite, every
 * migration applied), with the exact command the pg_cron job runs. G-86: on
 * 2026-10-02 all visitor data was deleted around the job's first run, so
 * these tests pin what the job may and may not delete. pg_cron itself does
 * not exist in PGlite, so the file is installed up to its pg_cron part.
 */

const root = process.cwd();
const retention = readFileSync(
  path.join(root, "deploy", "sandbox", "retention.sql"),
  "utf8",
);
const cronStart = retention.indexOf("CREATE EXTENSION IF NOT EXISTS pg_cron;");
const install = retention.slice(0, cronStart);
const cronCommand =
  /cron\.schedule\(\s*'[^']+',\s*'[^']+',\s*'([^']+)'\s*\)/.exec(
    retention.slice(cronStart),
  )?.[1];

const migrationsDir = path.join(root, "supabase", "migrations");
let db: PGlite;

async function count(table: string): Promise<number> {
  const result = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${table}`,
  );
  return result.rows[0]?.n ?? -1;
}

async function seedRegistration(): Promise<void> {
  await db.exec(`
    INSERT INTO external_connector_changes
      (change_id, action, capability, endpoint_url, policy_name, allowed_parameters,
       timeout_ms, reason, proposed_by, proposed_at, status, resolved_by, resolved_at)
    VALUES ('change-1', 'register', 'sandbox:receipt', 'https://example.com/api/release',
            'sandbox-receipt', ARRAY['note'], 10000, 'test', 'maker', now(), 'APPROVED',
            'checker', now());
    INSERT INTO external_connectors
      (registration_id, capability, endpoint_url, policy_name, allowed_parameters,
       timeout_ms, status, registered_at)
    VALUES ('change-1', 'sandbox:receipt', 'https://example.com/api/release',
            'sandbox-receipt', ARRAY['note'], 10000, 'active', now());
  `);
}

async function seedVisitorData(): Promise<void> {
  for (const [id, age] of [
    ["today", "1 hour"],
    ["old", "10 days"],
  ]) {
    await db.query(
      `INSERT INTO business_transactions
         (business_transaction_id, status, authority_json, authorization_json,
          intent_json, metadata_json, policy_json, signals_json, created_at)
       VALUES ($1, 'COMPLETED', '{}', '{}', '{}', '{}', '{}', '{}', now() - $2::interval)`,
      [id, age],
    );
    await db.query(
      `INSERT INTO caller_audit_events (type, occurred_at, route, caller_id)
       VALUES ('caller.authenticated', now() - $1::interval, '/transactions', 'sandbox-visitor')`,
      [age],
    );
    await db.query(
      `INSERT INTO handbook_download_leads (handbook_download_lead_id, email, captured_at)
       VALUES ($1, $2, now() - $3::interval)`,
      [id, `${id}@example.com`, age],
    );
  }
}

beforeAll(async () => {
  db = new PGlite();
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec(`CREATE ROLE ${role}`);
  }
  for (const name of readdirSync(migrationsDir).sort()) {
    if (name.endsWith(".sql")) {
      await db.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
    }
  }
  // Installing twice must work: the kit's check installs inside a rolled
  // back transaction and the install stage may be run again.
  await db.exec(install);
  await db.exec(install);
}, 120000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec("BEGIN");
});

afterEach(async () => {
  await db.exec("ROLLBACK");
});

describe("the sandbox retention job against real Postgres", () => {
  it("schedules a command the test can run", () => {
    expect(cronStart).toBeGreaterThan(0);
    expect(cronCommand).toBe("SELECT * FROM parmana_sandbox_retention(7)");
  });

  it("with the job's own command, keeps today's data and deletes data older than 7 days", async () => {
    await seedRegistration();
    await seedVisitorData();

    await db.exec(cronCommand as string);

    const left = await db.query<{ business_transaction_id: string }>(
      "SELECT business_transaction_id FROM business_transactions",
    );
    expect(left.rows.map((row) => row.business_transaction_id)).toEqual([
      "today",
    ]);
    expect(await count("caller_audit_events")).toBe(1);
    expect(await count("handbook_download_leads")).toBe(1);
  });

  it("writes a run log row with the period, the cutoff and the counts", async () => {
    await seedRegistration();
    await seedVisitorData();

    await db.exec(cronCommand as string);

    const runs = await db.query<{
      retention_days: number;
      old_enough: boolean;
      deleted: Record<string, number>;
    }>(
      `SELECT retention_days,
              cutoff BETWEEN now() - interval '7 days 1 minute' AND now() - interval '6 days 23 hours' AS old_enough,
              deleted
       FROM sandbox_retention_runs`,
    );
    expect(runs.rows).toHaveLength(1);
    expect(runs.rows[0]?.retention_days).toBe(7);
    expect(runs.rows[0]?.old_enough).toBe(true);
    expect(runs.rows[0]?.deleted.business_transactions).toBe(1);
    expect(runs.rows[0]?.deleted.caller_audit_events).toBe(1);
  });

  it.each([0, 1, 6])(
    "refuses a %i day period without the confirmation word, deleting nothing",
    async (days) => {
      await seedRegistration();
      await seedVisitorData();

      for (const call of [
        "SELECT * FROM parmana_sandbox_retention($1)",
        "SELECT * FROM parmana_sandbox_retention($1, 'yes')",
      ]) {
        await db.exec("SAVEPOINT refused");
        await expect(db.query(call, [days])).rejects.toThrow(
          /DELETE RECENT DATA/,
        );
        await db.exec("ROLLBACK TO SAVEPOINT refused");
      }
      expect(await count("business_transactions")).toBe(2);
      expect(await count("caller_audit_events")).toBe(2);
    },
  );

  it("deletes everything with 0 days and the confirmation word", async () => {
    await seedRegistration();
    await seedVisitorData();

    await db.exec(
      "SELECT * FROM parmana_sandbox_retention(0, 'DELETE RECENT DATA')",
    );

    expect(await count("business_transactions")).toBe(0);
    expect(await count("caller_audit_events")).toBe(0);
    expect(await count("handbook_download_leads")).toBe(0);
    expect(await count("external_connectors")).toBe(1);
  });

  it("previews a 0 day period, reporting the counts and deleting nothing (G-86)", async () => {
    await seedRegistration();
    await seedVisitorData();

    const preview = await db.query<{ table_name: string; deleted: string }>(
      "SELECT * FROM parmana_sandbox_retention_preview(0)",
    );
    const reported = Object.fromEntries(
      preview.rows.map((row) => [row.table_name, Number(row.deleted)]),
    );

    expect(reported.business_transactions).toBe(2);
    expect(reported.caller_audit_events).toBe(2);
    expect(reported.handbook_download_leads).toBe(2);
    expect(await count("business_transactions")).toBe(2);
    expect(await count("caller_audit_events")).toBe(2);
    expect(await count("handbook_download_leads")).toBe(2);
    expect(await count("sandbox_retention_runs")).toBe(0);
  });

  it("the preview deletes nothing even with no transaction around it (G-86)", async () => {
    await seedRegistration();
    await seedVisitorData();
    // Commit the seed, then call the preview on its own, as an editor that
    // commits each statement, or a transaction pooler, would.
    await db.exec("COMMIT");
    try {
      await db.query("SELECT * FROM parmana_sandbox_retention_preview(0)");
      expect(await count("business_transactions")).toBe(2);
      expect(await count("caller_audit_events")).toBe(2);
    } finally {
      await db.exec(`
        DELETE FROM business_transactions;
        DELETE FROM caller_audit_events;
        DELETE FROM handbook_download_leads;
        DELETE FROM external_connectors;
        DELETE FROM external_connector_changes;
      `);
      await db.exec("BEGIN");
    }
  });

  it("refuses a database without the active sandbox:receipt registration", async () => {
    await seedVisitorData();

    await expect(db.exec(cronCommand as string)).rejects.toThrow(
      /Not the sandbox database/,
    );
  });

  it("leaves only the guarded function: the one argument version is gone", async () => {
    const versions = await db.query<{ args: string }>(
      `SELECT pg_get_function_identity_arguments(oid) AS args
       FROM pg_proc WHERE proname = 'parmana_sandbox_retention'`,
    );
    expect(versions.rows.map((row) => row.args)).toEqual([
      "retention_days integer, confirmation text",
    ]);
  });
});
