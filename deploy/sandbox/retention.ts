/**
 * Installs the sandbox's daily retention job (deploy/sandbox/retention.sql)
 * into the SANDBOX database. Run by `setup-sandbox.ps1 -Stage Retention`.
 *
 *   npx tsx deploy/sandbox/retention.ts check   --project <sandbox project>
 *   npx tsx deploy/sandbox/retention.ts install --project <sandbox project>
 *
 * DATABASE_URL comes from the shell only. Unlike scripts/migrate-database.ts
 * this never reads the repository's .env, which holds production's database.
 * It refuses production's project, and a string whose project is not the one
 * named by --project.
 *
 * `check` installs the function and the job inside a transaction, runs the
 * preview with a 0 day period against the real data (so every delete runs
 * against the real foreign keys), prints what it would delete, and rolls
 * everything back. The preview undoes its own deletes, so the check deletes
 * nothing even if the transaction is not held (G-86). `install` installs the function and the daily job, and
 * deletes nothing.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const PRODUCTION_PROJECT = "ltjadvsjlpcygborxzet";

const [command, flag, project] = process.argv.slice(2);

if (
  (command !== "check" && command !== "install") ||
  flag !== "--project" ||
  !project
) {
  console.error(
    "Usage: npx tsx deploy/sandbox/retention.ts check|install --project <sandbox project>",
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("Set DATABASE_URL to the sandbox's session pooler string.");
  process.exit(1);
}

const target = new URL(url);
const user = decodeURIComponent(target.username);
const ref = user.startsWith("postgres.") ? user.slice("postgres.".length) : "";

if (ref === PRODUCTION_PROJECT || project === PRODUCTION_PROJECT) {
  console.error("That is PRODUCTION's database. Nothing was done.");
  process.exit(1);
}

// Port 6543 is Supabase's transaction pooler: it can send each statement to
// a different server connection, so BEGIN and ROLLBACK may not hold.
if (target.port === "6543") {
  console.error(
    "That is the transaction pooler (port 6543). Use the session pooler string, port 5432. Nothing was done.",
  );
  process.exit(1);
}

if (ref !== project) {
  console.error(
    `That string is for project "${ref}", not ${project}. Nothing was done.`,
  );
  process.exit(1);
}

console.log(
  `Database: ${target.hostname}:${target.port || "5432"}${target.pathname} as ${user}` +
    ` (${command === "check" ? "rolled back" : "writes"})`,
);

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "retention.sql"),
  "utf8",
);
const client = new pg.Client({ connectionString: url });

await client.connect();

try {
  await client.query("BEGIN");
  await client.query(sql);

  if (command === "check") {
    const result = await client.query<{ table_name: string; deleted: string }>(
      "SELECT * FROM parmana_sandbox_retention_preview(0)",
    );

    console.log("A 0 day period would delete, in this order:");
    for (const row of result.rows) {
      console.log(`  ${row.table_name.padEnd(26)} ${row.deleted}`);
    }
    await client.query("ROLLBACK");
    console.log("Rolled back: nothing was installed or deleted.");
  } else {
    await client.query("COMMIT");
    const job = await client.query<{ schedule: string; command: string }>(
      "SELECT schedule, command FROM cron.job WHERE jobname = 'parmana-sandbox-retention'",
    );

    console.log(
      `Installed. Job parmana-sandbox-retention: "${job.rows[0]?.schedule}" (UTC), ${job.rows[0]?.command}`,
    );
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(`Failed, nothing was changed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
