import "dotenv/config";

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import {
  appendFromDatabase,
  checkChain,
  checkPolicyCoverage,
  checkSignatures,
  isAppendOnly,
  normalizeDbRow,
  parseLog,
  recordFromRow,
  serializeLog,
  type LoggedApprovalRecord,
  type LogEntry,
  type PublicKeys,
} from "./policy-approval-log/policyApprovalLog.js";

/**
 * The public log of policy change approvals. See
 * governance/README.md for what it proves and how to check it.
 *
 *   npx tsx scripts/policy-approval-log.ts verify [--require-coverage] [--base <git ref>]
 *       Offline: the hash chain, every record's signature, that every
 *       policies/{name}/{version}/policy.json matches its latest logged
 *       approval (reported; fails only with --require-coverage), and with
 *       --base, that the log only grew since that commit.
 *
 *   npx tsx scripts/policy-approval-log.ts export
 *       Appends the database's approval records the log does not hold
 *       yet, and fetches any public key it has not seen. Needs
 *       CI_DATABASE_URL (the read only policy reader role) and
 *       optionally PARMANA_API_URL (default: production). Refuses to
 *       write if a logged record changed or disappeared in the database.
 *
 *   npx tsx scripts/policy-approval-log.ts check-db
 *       Same comparison as export, without writing: fails if the log is
 *       behind the database or disagrees with it.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_PATH = "governance/policy-approvals.jsonl";
const KEYS_PATH = "governance/policy-approval-keys.json";
const DEFAULT_API_URL = "https://parmana-api-real.vercel.app";

function readLog(): LogEntry[] {
  const file = path.join(root, LOG_PATH);
  return existsSync(file) ? parseLog(readFileSync(file, "utf8")) : [];
}

function readKeys(): Record<string, string[]> {
  const file = path.join(root, KEYS_PATH);
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, string[]>)
    : {};
}

function readPolicies(): Map<string, unknown> {
  const policies = new Map<string, unknown>();
  const dir = path.join(root, "policies");
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    for (const version of readdirSync(path.join(dir, name.name), {
      withFileTypes: true,
    })) {
      const file = path.join(dir, name.name, version.name, "policy.json");
      if (version.isDirectory() && existsSync(file)) {
        policies.set(
          `${name.name}/${version.name}`,
          JSON.parse(readFileSync(file, "utf8")),
        );
      }
    }
  }
  return policies;
}

function logAtRef(ref: string): LogEntry[] {
  // The commit must exist, or the append only check would pass by
  // comparing against nothing.
  execFileSync("git", ["cat-file", "-e", `${ref}^{commit}`], {
    cwd: root,
    stdio: "ignore",
  });
  let text: string;
  try {
    text = execFileSync("git", ["show", `${ref}:${LOG_PATH}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    // The log did not exist yet at that commit.
    return [];
  }
  return parseLog(text);
}

function report(title: string, problems: readonly string[]): void {
  if (problems.length === 0) return;
  console.error(`\n${title}:`);
  for (const problem of problems) console.error(`  - ${problem}`);
}

function verify(args: string[]): number {
  const entries = readLog();
  const keys: PublicKeys = readKeys();
  const chain = checkChain(entries);
  const signatures = checkSignatures(entries, keys);
  const coverage = checkPolicyCoverage(entries, readPolicies());
  const baseIndex = args.indexOf("--base");
  const base = baseIndex >= 0 ? args[baseIndex + 1] : undefined;
  const appendOnly =
    base === undefined || isAppendOnly(logAtRef(base), entries)
      ? []
      : [
          `${LOG_PATH} changed or removed entries that ${base} has; it may only grow.`,
        ];
  const requireCoverage = args.includes("--require-coverage");

  console.log(`${LOG_PATH}: ${entries.length} approvals.`);
  report("Chain", chain);
  report("Signatures", signatures);
  report("Append only", appendOnly);
  report(
    requireCoverage ? "Policy files" : "Policy files (not enforced yet)",
    coverage,
  );

  const failed =
    chain.length +
    signatures.length +
    appendOnly.length +
    (requireCoverage ? coverage.length : 0);
  console.log(
    failed === 0
      ? "The log verifies: the chain is intact and every signature checks out."
      : `\n${failed} problem(s).`,
  );
  return failed === 0 ? 0 : 1;
}

/**
 * Reads the approval records directly from PostgreSQL, through the read-only
 * role named in CI_DATABASE_URL. That role has SELECT on
 * policy_change_approval_records only, under RLS (see
 * supabase/migrations/20260818150000_add_ci_read_only_policy_for_approval_records.sql).
 * It is not DATABASE_URL, which bypasses RLS.
 */
async function databaseRecords(): Promise<LoggedApprovalRecord[]> {
  const url = process.env.CI_DATABASE_URL;
  if (!url) {
    throw new Error(
      "Set CI_DATABASE_URL to the read-only policy approval reader role.",
    );
  }
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const { rows } = await pool.query(
      "SELECT * FROM policy_change_approval_records " +
        "ORDER BY approved_at ASC, policy_change_approval_record_id ASC",
    );
    return rows.map((row) =>
      recordFromRow(normalizeDbRow(row as Record<string, unknown>)),
    );
  } finally {
    await pool.end();
  }
}

async function exportOrCheck(write: boolean): Promise<number> {
  const current = readLog();
  const { entries, added, problems } = appendFromDatabase(
    current,
    await databaseRecords(),
  );
  if (problems.length > 0) {
    report("The database disagrees with the log", problems);
    return 1;
  }
  if (!write) {
    if (added > 0) {
      console.error(
        `The log is behind the database by ${added} approval(s). Run export.`,
      );
      return 1;
    }
    console.log(`The log matches the database (${entries.length} approvals).`);
    return 0;
  }

  const keys = readKeys();
  const apiUrl = process.env.PARMANA_API_URL ?? DEFAULT_API_URL;
  for (const keyId of new Set(
    entries.map((entry) => entry.record.signature.keyId),
  )) {
    if (keys[keyId]) continue;
    const response = await fetch(`${apiUrl}/keys/${encodeURIComponent(keyId)}`);
    if (!response.ok)
      throw new Error(`Fetching key "${keyId}" failed: ${response.status}`);
    keys[keyId] = [((await response.json()) as { pem: string }).pem];
  }
  writeFileSync(path.join(root, LOG_PATH), serializeLog(entries));
  writeFileSync(
    path.join(root, KEYS_PATH),
    `${JSON.stringify(keys, null, 2)}\n`,
  );
  console.log(
    `Appended ${added} approval(s); the log now holds ${entries.length}.`,
  );
  return verify([]);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "verify") process.exit(verify(args));
  if (command === "export") process.exit(await exportOrCheck(true));
  if (command === "check-db") process.exit(await exportOrCheck(false));
  console.error("Usage: policy-approval-log.ts verify|export|check-db");
  process.exit(2);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
