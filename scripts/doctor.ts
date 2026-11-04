/**
 * Checks the configuration the server would start with, and prints every
 * problem with its fix. Exits 0 when no check fails, 1 when one does.
 *
 * It reads the same environment the server reads, including the repository
 * .env file, and never prints a setting's value. Run it from the repository root:
 *
 *   npm run doctor               local deployment
 *   npm run doctor -- --production   production rules as well
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

import dotenv from "dotenv";

import { diagnoseConfiguration, type DoctorCheck } from "@parmana/shared";

// Same .env the server reads. PARMANA_SKIP_DOTENV keeps test runs from loading one.
if (process.env.PARMANA_SKIP_DOTENV !== "1" && existsSync(".env")) {
  dotenv.config({ path: ".env", quiet: true });
}

// --production applies the production rules as well. Without it, the local rules apply.
const production = process.argv.includes("--production");

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
