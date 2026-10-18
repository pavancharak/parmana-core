import "dotenv/config";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import {
  applyPendingMigrations,
  baselineMigrations,
  migrationStatus,
} from "./migrations/runMigrations.js";

/**
 * Tracked migrations for any Postgres, through DATABASE_URL (G-61). See
 * scripts/migrations/runMigrations.ts, and docs/site/deployment/production.mdx
 * step 2 for when to use each command.
 *
 *   npx tsx scripts/migrate-database.ts status
 *   npx tsx scripts/migrate-database.ts apply [--dry-run]
 *   npx tsx scripts/migrate-database.ts baseline --through <file name>
 *
 * DATABASE_URL is read from the shell, or from the repository's .env file
 * when the shell does not set it. The first line printed names the database.
 * `status` and `apply --dry-run` never write.
 *
 * Exit code 0 on success, 1 on a failed migration or bad input.
 */

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationsDir = join(repoRoot, "supabase", "migrations");
const rolesSql = readFileSync(
  join(repoRoot, "docker", "local", "postgres-roles.sql"),
  "utf8",
);

function usage(): never {
  console.error(
    "Usage:\n" +
      "  npx tsx scripts/migrate-database.ts status\n" +
      "  npx tsx scripts/migrate-database.ts apply [--dry-run]\n" +
      "  npx tsx scripts/migrate-database.ts baseline --through <file name>\n" +
      "DATABASE_URL is read from the shell, or from the repository's .env file.",
  );
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);

// Checked before any connection is opened, so a mistyped command never
// touches a database.
if (command !== "status" && command !== "apply" && command !== "baseline") {
  usage();
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  usage();
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

// Say which database this is before touching it. DATABASE_URL may come from
// the repository's .env file, not only from the shell. The password is never
// printed.
const target = new URL(process.env.DATABASE_URL as string);
console.log(
  `Database: ${target.hostname}:${target.port || "5432"}${target.pathname}` +
    ` as ${decodeURIComponent(target.username)}` +
    ` (${command === "status" || args.includes("--dry-run") ? "read only" : "writes"})\n`,
);

try {
  await client.connect();

  if (command === "status") {
    const status = await migrationStatus(client, migrationsDir);
    for (const name of status.applied) console.log(`applied  ${name}`);
    for (const name of status.pending) console.log(`pending  ${name}`);
    for (const name of status.unknown) {
      console.log(`unknown  ${name} (recorded, but no such file)`);
    }
    console.log(
      `\n${status.applied.length} applied, ${status.pending.length} pending` +
        (status.unknown.length ? `, ${status.unknown.length} unknown` : ""),
    );
  } else if (command === "apply") {
    const dryRun = args.includes("--dry-run");
    const { applied } = await applyPendingMigrations(client, migrationsDir, {
      rolesSql,
      dryRun,
    });
    for (const name of applied) {
      console.log(`${dryRun ? "would apply" : "applied"}  ${name}`);
    }
    console.log(
      `\n${applied.length} migration(s) ${dryRun ? "would be applied" : "applied"}.`,
    );
  } else if (command === "baseline") {
    const index = args.indexOf("--through");
    const through = index === -1 ? undefined : args[index + 1];
    if (!through) usage();
    const { recorded } = await baselineMigrations(
      client,
      migrationsDir,
      through,
    );
    for (const name of recorded) console.log(`recorded  ${name}`);
    console.log(
      `\n${recorded.length} migration(s) recorded as applied, without running them.`,
    );
  } else {
    usage();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
