/**
 * Checks the configuration the server would start with, and prints every
 * problem with its fix. Exits 0 when no check fails, 1 when one does.
 *
 * It reads the same environment the server reads, including the repository
 * .env file, and never prints a setting's value. Run it from the repository root:
 *
 *   npm run doctor                        local rules
 *   npm run doctor -- --production        local and production rules
 * npm run doctor -- --online            also probes the database and KMS
 *   npm run doctor -- --production --online
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

import dotenv from "dotenv";

import { DEFAULT_KEY_ID, SignerBootstrap } from "@parmana/crypto";
import { PostgresPoolFactory } from "@parmana/storage";
import { diagnoseConfiguration, type DoctorCheck } from "@parmana/shared";

import {
  runOnlineChecks,
  type DatabaseQuery,
  type OnlineDeps,
} from "./doctor-online.js";

// Same .env the server reads. PARMANA_SKIP_DOTENV keeps test runs from loading one.
if (process.env.PARMANA_SKIP_DOTENV !== "1" && existsSync(".env")) {
  dotenv.config({ path: ".env", quiet: true });
}

const production = process.argv.includes("--production");
const online = process.argv.includes("--online");

const checks: DoctorCheck[] = diagnoseConfiguration(
  process.env,
  {
    directoryExists: (path) => existsSync(path) && statSync(path).isDirectory(),
    listDirectory: (path) => {
      try {
        return readdirSync(path);
      } catch {
        return [];
      }
    },
    readFile: (path) => readFileSync(path, "utf8"),
  },
  { production },
);

if (online) {
  // The same database factory the server uses, so the search path and TLS settings match.
  const pool = process.env.DATABASE_URL
    ? PostgresPoolFactory.create()
    : undefined;
  const query: DatabaseQuery | undefined = pool
    ? async (sql, params) => (await pool.query(sql, params)).rows
    : undefined;

  const deps: OnlineDeps = {
    query,
    kms:
      process.env.KEY_PROVIDER === "aws-kms"
        ? () => SignerBootstrap.create()
        : undefined,
    defaultKeyId: DEFAULT_KEY_ID,
  };

  checks.push(...(await runOnlineChecks(process.env, deps)));
  await pool?.end().catch(() => undefined);
}

const LABEL: Record<DoctorCheck["level"], string> = {
  pass: "PASS",
  warn: "WARN",
  fail: "FAIL",
};

for (const check of checks) {
  console.log(`[${LABEL[check.level]}] ${check.name}: ${check.message}`);
  if (check.fix !== undefined && check.level !== "pass") {
    console.log(`       fix: ${check.fix}`);
  }
}

const failures = checks.filter((check) => check.level === "fail").length;
const warnings = checks.filter((check) => check.level === "warn").length;
console.log(`\n${failures} failing, ${warnings} to review`);
process.exitCode = failures > 0 ? 1 : 0;
