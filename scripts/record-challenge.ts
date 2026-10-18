import "dotenv/config";

import { readFileSync } from "node:fs";

import pg from "pg";

import type { ChallengeRecord } from "@parmana/shared";
import { PostgresChallengeRecordRepository } from "@parmana/storage";

/**
 * Writes a Challenge Record (RFC-0022) from a JSON file to the
 * challenge_records table, through DATABASE_URL.
 *
 *   npx tsx scripts/record-challenge.ts governance/challenges/CR-2026-10-001.json [--dry-run]
 *
 * The file is the public copy of the record and stays in the repository.
 * A record that already exists is never overwritten: a Challenge Record
 * is append only, and a correction is a new record linked through
 * `supersedes`.
 *
 * DATABASE_URL is read from the shell, or from the repository's .env file
 * when the shell does not set it. The first line printed names the
 * database. `--dry-run` reads but never writes.
 *
 * Exit code 0 on success, 1 on bad input, an existing record or a failed
 * write.
 */

function usage(): never {
  console.error(
    "Usage: npx tsx scripts/record-challenge.ts <record.json> [--dry-run]\n" +
      "DATABASE_URL is read from the shell, or from the repository's .env file.",
  );
  process.exit(1);
}

function date(value: unknown, field: string): Date {
  const parsed = typeof value === "string" ? new Date(value) : undefined;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    console.error(`${field} is not an ISO 8601 date: ${String(value)}`);
    process.exit(1);
  }
  return parsed;
}

/** The record as it is stored in the file, with dates as strings. */
interface RecordFile {
  readonly [field: string]: unknown;
  readonly source?: { readonly raisedAt?: unknown };
  readonly investigationSteps?: readonly { readonly performedAt?: unknown }[];
  readonly disclosure?: { readonly disclosedAt?: unknown };
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
}

/** Parses the file and turns its ISO date strings back into Dates. */
function readRecord(path: string): ChallengeRecord {
  const raw = JSON.parse(readFileSync(path, "utf8")) as RecordFile;

  for (const field of ["challengeRecordId", "status", "claimChallenged"]) {
    if (typeof raw[field] !== "string" || raw[field] === "") {
      console.error(`${field} is missing or empty.`);
      process.exit(1);
    }
  }

  return {
    ...raw,
    source: {
      ...raw.source,
      raisedAt: date(raw.source?.raisedAt, "source.raisedAt"),
    },
    investigationSteps: (raw.investigationSteps ?? []).map((step, index) => ({
      ...step,
      performedAt: date(
        step.performedAt,
        `investigationSteps[${index}].performedAt`,
      ),
    })),
    ...(raw.disclosure && {
      disclosure: {
        ...raw.disclosure,
        ...(raw.disclosure.disclosedAt !== undefined && {
          disclosedAt: date(
            raw.disclosure.disclosedAt,
            "disclosure.disclosedAt",
          ),
        }),
      },
    }),
    createdAt: date(raw.createdAt, "createdAt"),
    updatedAt: date(raw.updatedAt, "updatedAt"),
  } as unknown as ChallengeRecord;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const [path] = args.filter((arg) => arg !== "--dry-run");

if (!path) usage();

// Checked before any connection is opened.
const record = readRecord(path);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  usage();
}

// Say which database this is before touching it. The password is never
// printed.
const target = new URL(process.env.DATABASE_URL as string);
console.log(
  `Database: ${target.hostname}:${target.port || "5432"}${target.pathname}` +
    ` as ${decodeURIComponent(target.username)}` +
    ` (${dryRun ? "read only" : "writes"})\n`,
);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const repository = new PostgresChallengeRecordRepository(pool);

try {
  const existing = await repository.findById(record.challengeRecordId);

  if (existing) {
    console.error(
      `${record.challengeRecordId} already exists (status ${existing.status}). ` +
        "Challenge Records are append only; nothing was written.",
    );
    process.exitCode = 1;
  } else if (dryRun) {
    console.log(
      `Would write ${record.challengeRecordId} (${record.status}, ` +
        `${record.investigationSteps.length} investigation step(s)).`,
    );
  } else {
    await repository.create(record);
    console.log(`Wrote ${record.challengeRecordId} (${record.status}).`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
