import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyPendingMigrations,
  baselineMigrations,
  migrationStatus,
  type QueryClient,
} from "../migrations/runMigrations.js";

/**
 * Unit tests for the tracked migration runner (G-61). A fake client records
 * every statement and keeps the tracking table in memory; a statement that
 * contains FAIL throws, like a migration that errors in Postgres. The real
 * SQL was also run against a real Postgres on 2026-09-25, see
 * docs/VERIFICATION-GAPS.md G-61.
 */
class FakeClient implements QueryClient {
  public readonly statements: string[] = [];
  public readonly recorded = new Set<string>();
  public tableExists = false;
  private pending: string[] = [];
  private inTransaction = false;

  async query(sql: string, values: readonly unknown[] = []) {
    this.statements.push(sql.trim());

    if (sql.includes("FAIL")) throw new Error("syntax error at FAIL");
    if (sql.includes("CREATE TABLE IF NOT EXISTS parmana_schema_migrations")) {
      this.tableExists = true;
    }
    if (sql.includes("to_regclass('parmana_schema_migrations')")) {
      return { rows: [{ present: this.tableExists }] };
    }
    if (sql === "BEGIN") this.inTransaction = true;
    if (sql === "COMMIT") {
      for (const name of this.pending) this.recorded.add(name);
      this.pending = [];
      this.inTransaction = false;
    }
    if (sql === "ROLLBACK") {
      this.pending = [];
      this.inTransaction = false;
    }
    if (sql.startsWith("INSERT INTO parmana_schema_migrations")) {
      const name = String(values[0]);
      if (this.inTransaction) this.pending.push(name);
      else this.recorded.add(name);
    }
    if (sql.startsWith("SELECT name FROM parmana_schema_migrations")) {
      return { rows: [...this.recorded].map((name) => ({ name })) };
    }
    return { rows: [] };
  }
}

describe("tracked migrations (G-61)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "parmana-migrations-"));
    writeFileSync(join(dir, "001_first.sql"), "CREATE TABLE a (id int);");
    writeFileSync(join(dir, "002_second.sql"), "CREATE TABLE b (id int);");
    writeFileSync(join(dir, "003_third.sql"), "CREATE TABLE c (id int);");
    writeFileSync(join(dir, "notes.txt"), "not a migration");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("applies every pending migration once, in filename order, each in its own transaction", async () => {
    const client = new FakeClient();

    const first = await applyPendingMigrations(client, dir, {
      rolesSql: "CREATE ROLE anon",
    });

    expect(first.applied).toEqual([
      "001_first.sql",
      "002_second.sql",
      "003_third.sql",
    ]);
    expect(client.statements).toContain("CREATE ROLE anon");
    expect(client.statements.filter((s) => s === "BEGIN")).toHaveLength(3);
    expect(client.statements.filter((s) => s === "COMMIT")).toHaveLength(3);

    const second = await applyPendingMigrations(client, dir);
    expect(second.applied).toEqual([]);
  });

  it("stops at a failing migration, rolls it back, and keeps the earlier ones", async () => {
    writeFileSync(join(dir, "002_second.sql"), "FAIL here;");
    const client = new FakeClient();

    await expect(applyPendingMigrations(client, dir)).rejects.toThrow(
      /Migration 002_second.sql failed and was rolled back; 1 migration\(s\) before it were applied/,
    );

    expect([...client.recorded]).toEqual(["001_first.sql"]);
    expect(client.statements).toContain("ROLLBACK");
    expect(client.statements).not.toContain("CREATE TABLE c (id int);");
  });

  it("reports status: applied, pending and unknown", async () => {
    const client = new FakeClient();
    client.tableExists = true;
    client.recorded.add("001_first.sql");
    client.recorded.add("000_removed.sql");

    expect(await migrationStatus(client, dir)).toEqual({
      applied: ["001_first.sql"],
      pending: ["002_second.sql", "003_third.sql"],
      unknown: ["000_removed.sql"],
    });
  });

  it("status never writes: on a database with no tracking table it creates none", async () => {
    const client = new FakeClient();

    const status = await migrationStatus(client, dir);

    expect(status.pending).toHaveLength(3);
    expect(client.tableExists).toBe(false);
    expect(client.statements.some((s) => /CREATE|INSERT/.test(s))).toBe(false);
  });

  it("dry run lists the pending migrations and runs nothing", async () => {
    const client = new FakeClient();

    const result = await applyPendingMigrations(client, dir, { dryRun: true });

    expect(result.applied).toEqual([
      "001_first.sql",
      "002_second.sql",
      "003_third.sql",
    ]);
    expect(client.statements).not.toContain("BEGIN");
    expect(client.recorded.size).toBe(0);
    expect(client.tableExists).toBe(false);
  });

  it("baseline records up to and including the named file without running any of them", async () => {
    const client = new FakeClient();

    const result = await baselineMigrations(client, dir, "002_second.sql");

    expect(result.recorded).toEqual(["001_first.sql", "002_second.sql"]);
    expect(client.statements.some((s) => s.startsWith("CREATE TABLE a"))).toBe(
      false,
    );

    const after = await applyPendingMigrations(client, dir);
    expect(after.applied).toEqual(["003_third.sql"]);
  });

  it("baseline refuses a file name that is not a migration", async () => {
    await expect(
      baselineMigrations(new FakeClient(), dir, "999_missing.sql"),
    ).rejects.toThrow(/No migration named 999_missing.sql/);
  });
});

describe("migration lock (concurrent runners)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "migrations-lock-"));
    writeFileSync(join(dir, "001_one.sql"), "CREATE TABLE one (id int);");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("takes the advisory lock before anything else, and releases it last", async () => {
    const client = new FakeClient();

    await applyPendingMigrations(client, dir);

    expect(client.statements[0]).toContain("pg_advisory_lock(");
    expect(client.statements.at(-1)).toContain("pg_advisory_unlock(");
    expect(
      client.statements.filter((sql) => sql.includes("pg_advisory_lock(")),
    ).toHaveLength(1);
  });

  it("releases the lock when a migration fails", async () => {
    writeFileSync(join(dir, "002_bad.sql"), "SELECT FAIL;");
    const client = new FakeClient();

    await expect(applyPendingMigrations(client, dir)).rejects.toThrow(
      /002_bad.sql/,
    );

    expect(client.statements.at(-1)).toContain("pg_advisory_unlock(");
  });

  it("does not take the lock for a dry run", async () => {
    const client = new FakeClient();

    await applyPendingMigrations(client, dir, { dryRun: true });

    expect(client.statements.some((sql) => sql.includes("pg_advisory"))).toBe(
      false,
    );
  });
});

/**
 * The race itself, against a real PostgreSQL. Two runners start together on
 * the same pending migration. Without the lock, the second one fails on the
 * tracking insert or on the table it tries to create. With it, the second
 * waits, sees the migration recorded, and applies nothing.
 *
 * Runs only when PARMANA_TEST_DATABASE_URL is set, and drops and recreates
 * the tables it uses, so point it at an empty throwaway database.
 */
const realUrl = process.env.PARMANA_TEST_DATABASE_URL;

describe.skipIf(!realUrl)("migration lock against real PostgreSQL", () => {
  it("applies a migration once when two runners start together", async () => {
    const pg = await import("pg");
    const dir = mkdtempSync(join(tmpdir(), "migrations-race-"));

    writeFileSync(
      join(dir, "001_demo.sql"),
      [
        "CREATE TABLE IF NOT EXISTS demo_effect (id serial primary key, note text);",
        "SELECT pg_sleep(1);",
        "INSERT INTO demo_effect (note) VALUES ('applied');",
      ].join("\n"),
    );

    const admin = new pg.default.Client({ connectionString: realUrl });
    await admin.connect();
    await admin.query("DROP TABLE IF EXISTS demo_effect");
    await admin.query("DROP TABLE IF EXISTS parmana_schema_migrations");

    const runner = async () => {
      const client = new pg.default.Client({ connectionString: realUrl });
      await client.connect();
      try {
        return await applyPendingMigrations(client as never, dir);
      } finally {
        await client.end();
      }
    };

    try {
      const results = await Promise.allSettled([runner(), runner()]);
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);

      const applied = results.map((r) =>
        r.status === "fulfilled" ? r.value.applied.length : -1,
      );
      expect(applied.sort()).toEqual([0, 1]);

      const { rows } = await admin.query(
        "SELECT count(*)::int AS n FROM demo_effect",
      );
      expect(rows[0]?.n).toBe(1);
    } finally {
      await admin.query("DROP TABLE IF EXISTS demo_effect");
      await admin.query("DROP TABLE IF EXISTS parmana_schema_migrations");
      await admin.end();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
