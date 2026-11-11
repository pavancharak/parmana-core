#!/usr/bin/env node
// Readiness check for the local test database (.env.test, option A).
//
// Run before the test suites, and from the pre-commit and pre-push hooks.
//
// For the local Compose database (the URL in .env.test.example), the check
// repairs what it can: it starts the container when nothing listens, and it
// applies missing migrations with `docker compose run --rm migrate`. The
// migrate step records each migration once, so running it again is safe.
// A fresh clone, or a reset volume, therefore needs no manual step.
//
// Any other database is only checked, never changed. For it the check fails
// with the command that fixes the problem.
//
// Read-only except for the two repairs above. Exit 0 when ready, 1 when not.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const START =
  "docker compose up -d postgres && docker compose run --rm migrate";

function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function fail(lines) {
  for (const line of lines) console.error(`db-check: ${line}`);
  process.exit(1);
}

function compose(args) {
  execFileSync("docker", ["compose", ...args], { cwd: root, stdio: "inherit" });
}

function isListening(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(2000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function waitForPort(host, port, seconds) {
  for (let i = 0; i < seconds; i++) {
    if (await isListening(host, port)) return true;
    await sleep(1000);
  }
  return false;
}

// True when the URL is the local Compose database: same host, port, database
// and user as the template. Only this database is ever changed.
function isLocalCompose(url, templateUrl) {
  const u = new URL(url);
  const t = new URL(templateUrl);
  return (
    u.hostname === t.hostname &&
    u.port === t.port &&
    u.pathname === t.pathname &&
    u.username === t.username
  );
}

// Returns the migrations not yet recorded, or every one when the table is
// missing. Returns null when the pg package is not installed.
async function missingMigrations(url, expected) {
  const pg = await import("pg").catch(() => null);
  if (pg === null) return null;

  const client = new pg.default.Client({
    connectionString: url,
    connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
    const result = await client.query(
      "SELECT name FROM parmana_schema_migrations",
    );
    const applied = new Set(result.rows.map((row) => row.name));
    return { missing: expected.filter((name) => !applied.has(name)) };
  } catch (error) {
    const message = String(error?.message ?? error);
    if (/relation "parmana_schema_migrations" does not exist/.test(message)) {
      return { missing: expected, noTable: true };
    }
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const testEnv = readEnvFile(join(root, ".env.test"));
  const template = readEnvFile(join(root, ".env.test.example"));
  const url =
    process.env.TEST_DATABASE_URL ||
    testEnv.TEST_DATABASE_URL ||
    testEnv.DATABASE_URL;

  if (!url) {
    fail([
      "no DATABASE_URL or TEST_DATABASE_URL in .env.test.",
      "Create it: Copy-Item .env.test.example .env.test",
    ]);
  }

  const parsed = new URL(url);
  const host = parsed.hostname;
  const port = Number(parsed.port || 5432);
  const local =
    template.DATABASE_URL !== undefined &&
    isLocalCompose(url, template.DATABASE_URL);

  // 1. Something must be listening. For the local database, start it.
  if (!(await isListening(host, port))) {
    if (!local) {
      fail([
        `nothing is listening at ${host}:${port}.`,
        `Start the local database: ${START}`,
        "Then rerun the commit or the test command.",
      ]);
    }
    console.log("db-check: starting the local database...");
    try {
      compose(["up", "-d", "postgres"]);
    } catch {
      fail([
        "could not start the local database. Is Docker Desktop running?",
        `Then run: ${START}`,
      ]);
    }
    if (!(await waitForPort(host, port, 60))) {
      fail([
        `the database at ${host}:${port} did not accept connections within 60 seconds.`,
        "Check it with: docker compose ps",
      ]);
    }
  }

  // 2. A stale port in .env.test: warn, do not guess.
  if (template.DATABASE_URL && !local) {
    const templatePort = new URL(template.DATABASE_URL).port;
    if (String(port) !== templatePort) {
      console.warn(
        `db-check: warning: ${host}:${port} differs from .env.test.example ` +
          `(${templatePort}). If this is not a database you meant to use, ` +
          "copy the template again and rerun.",
      );
    }
  }

  // 3. Every migration recorded. Repair the local database if it is not.
  const expected = readdirSync(join(root, "supabase", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  let status = await missingMigrations(url, expected);
  if (status === null) {
    console.warn(
      "db-check: warning: the pg package is not installed, so migrations were not checked. Run npm ci.",
    );
    console.log(`db-check: database reachable at ${host}:${port}.`);
    return;
  }

  if (status.missing.length > 0 && local) {
    console.log(
      `db-check: applying ${status.missing.length} missing migration(s)...`,
    );
    try {
      compose(["run", "--rm", "migrate"]);
    } catch {
      fail([
        "the migrate step failed (see the output above).",
        `Fix the cause, then run: ${START}`,
      ]);
    }
    status = await missingMigrations(url, expected);
  }

  if (status.missing.length > 0) {
    fail([
      status.noTable
        ? "the database is reachable but has no migrations table."
        : `${status.missing.length} of ${expected.length} migrations are not applied (first: ${status.missing[0]}).`,
      `Apply them: ${START}`,
    ]);
  }

  console.log(
    `db-check: database ready at ${host}:${port}, ${expected.length} migrations applied.`,
  );
}

await main();
