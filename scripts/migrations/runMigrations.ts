import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tracked database migrations for any Postgres (G-61).
 *
 * Applies each file in supabase/migrations/ once, in filename order, each in
 * its own transaction, and records it in `parmana_schema_migrations`. The
 * table is the same one the self hosted deployment's `migrate` service uses
 * (docker/local/migrate.sh), so a database can move between the two.
 *
 * Why: scripts/apply-all-migrations.sql applies every migration again on
 * every run, and on a database that already holds data an older migration
 * adds back an older CHECK constraint over newer rows, and fails. A database
 * that was set up that way has no record of what it has; `baseline` gives it
 * one without running anything.
 */

/**
 * The part of a pg client this module uses, so tests can pass a fake.
 */
export interface QueryClient {
  query(
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface MigrationStatus {
  readonly applied: readonly string[];
  readonly pending: readonly string[];

  /**
   * Recorded as applied, but no longer in the migrations directory.
   */
  readonly unknown: readonly string[];
}

const MIGRATION_LOCK_SQL =
  "SELECT pg_advisory_lock(hashtext('parmana_schema_migrations'))";
const MIGRATION_UNLOCK_SQL =
  "SELECT pg_advisory_unlock(hashtext('parmana_schema_migrations'))";

const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS parmana_schema_migrations (
    name       text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

export function listMigrationFiles(directory: string): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/**
 * The recorded migrations. With `create`, makes the tracking table first;
 * without it, a database that has no table yet is reported as having none
 * recorded and nothing is written, so `status` never changes a database.
 */
async function appliedNames(
  client: QueryClient,
  create: boolean,
): Promise<Set<string>> {
  if (create) {
    await client.query(TABLE_SQL);
  } else {
    const { rows } = await client.query(
      "SELECT to_regclass('parmana_schema_migrations') IS NOT NULL AS present",
    );
    if (rows[0]?.present !== true) return new Set();
  }
  const { rows } = await client.query(
    "SELECT name FROM parmana_schema_migrations",
  );
  return new Set(rows.map((row) => String(row.name)));
}

export async function migrationStatus(
  client: QueryClient,
  directory: string,
  options: { readonly createTable?: boolean } = {},
): Promise<MigrationStatus> {
  const files = listMigrationFiles(directory);
  const applied = await appliedNames(client, options.createTable ?? false);

  return {
    applied: files.filter((name) => applied.has(name)),
    pending: files.filter((name) => !applied.has(name)),
    unknown: [...applied].filter((name) => !files.includes(name)).sort(),
  };
}

/**
 * Applies every pending migration, oldest first. Stops at the first one that
 * fails: its transaction is rolled back, nothing of it remains, and the error
 * names the file. Migrations applied before it stay applied and recorded.
 *
 * @param rolesSql Run first, outside the migrations. Creates the roles some
 *   migrations grant to, when they do not exist (docker/local/
 *   postgres-roles.sql). A no op on Supabase, which has them.
 */
export async function applyPendingMigrations(
  client: QueryClient,
  directory: string,
  options: { readonly rolesSql?: string; readonly dryRun?: boolean } = {},
): Promise<{ readonly applied: readonly string[] }> {
  if (options.dryRun) {
    const { pending } = await migrationStatus(client, directory, {
      createTable: false,
    });

    return { applied: pending };
  }

  // Two deployments that start together must not both read the same pending
  // list and race to run it. A session-level advisory lock serializes them:
  // the second runner waits, then finds the migrations already recorded. The
  // lock is taken before the pending list is read, and released in finally.
  // The lock belongs to this connection, so the client must be one connection.
  await client.query(MIGRATION_LOCK_SQL);

  try {
    return await applyLocked(client, directory, options);
  } finally {
    await client.query(MIGRATION_UNLOCK_SQL);
  }
}

async function applyLocked(
  client: QueryClient,
  directory: string,
  options: { readonly rolesSql?: string },
): Promise<{ readonly applied: readonly string[] }> {
  const { pending } = await migrationStatus(client, directory, {
    createTable: true,
  });

  if (options.rolesSql !== undefined) {
    await client.query(options.rolesSql);
  }

  const done: string[] = [];

  for (const name of pending) {
    const sql = readFileSync(join(directory, name), "utf8");

    await client.query("BEGIN");

    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO parmana_schema_migrations (name) VALUES ($1)",
        [name],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(
        `Migration ${name} failed and was rolled back; ` +
          `${done.length} migration(s) before it were applied. ` +
          (error instanceof Error ? error.message : String(error)),
        { cause: error },
      );
    }

    done.push(name);
  }

  return { applied: done };
}

/**
 * Records migrations as applied WITHOUT running them: every file up to and
 * including `through`. For a database whose schema was created by other
 * means (scripts/apply-all-migrations.sql, the Supabase SQL editor,
 * `supabase db push`) and so has no tracking table yet. Use it only when
 * those migrations really are applied; afterwards `apply` runs only newer
 * files.
 */
export async function baselineMigrations(
  client: QueryClient,
  directory: string,
  through: string,
): Promise<{ readonly recorded: readonly string[] }> {
  const files = listMigrationFiles(directory);
  const index = files.indexOf(through);

  if (index === -1) {
    throw new Error(
      `No migration named ${through} in ${directory}. Give a file name ` +
        "exactly as `status` lists it.",
    );
  }

  const applied = await appliedNames(client, true);
  const recorded: string[] = [];

  for (const name of files.slice(0, index + 1)) {
    if (applied.has(name)) continue;

    await client.query(
      "INSERT INTO parmana_schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      [name],
    );
    recorded.push(name);
  }

  return { recorded };
}
