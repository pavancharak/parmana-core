/**
 * `npm run mutation -- <package> [<package> ...]`: mutation testing with
 * Stryker (stryker.config.mjs), one package at a time.
 *
 * Stryker makes small deliberate changes to a package's source (for
 * example `<=` to `<`, a condition to `true`, a call removed), one at a
 * time, and runs that package's tests against each. The mutation score is
 * the share of those changes the tests catch. It says more about the
 * tests than a count of tests or line coverage does.
 *
 * Reports: reports/mutation/<package>.html and .json (gitignored).
 * Slow: every mutant runs the package's whole test suite.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface MutantReport {
  files: Record<string, { mutants: { status: string }[] }>;
}

const packages = process.argv.slice(2);
if (packages.length === 0) {
  console.error(
    "Usage: npm run mutation -- <package> [<package> ...]  (for example envelope-verifier)",
  );
  process.exit(2);
}

//
// Node 24 is what this repository and CI run. On an older Node the
// ML-DSA-65 and hybrid signature tests skip themselves, so every mutant
// in those paths "survives" and the score is wrong, not just low.
//
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 24) {
  console.error(
    `npm run mutation needs Node 24 or later (this is ${process.versions.node}): ` +
      "on an older Node the ML-DSA-65 tests are skipped and the scores are wrong.",
  );
  process.exit(2);
}

const summary: string[] = [];
let failed = false;
for (const pkg of packages) {
  if (
    !/^[a-z0-9-]+$/.test(pkg) ||
    !existsSync(path.join(root, "packages", pkg, "src"))
  ) {
    console.error(`No package packages/${pkg}/src.`);
    process.exit(2);
  }
  const run = spawnSync("npx", ["stryker", "run"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, STRYKER_PACKAGE: pkg },
    shell: process.platform === "win32",
  });
  if (run.status !== 0) {
    failed = true;
    summary.push(`${pkg}: Stryker exited with ${run.status}`);
    continue;
  }
  const report = JSON.parse(
    readFileSync(path.join(root, "reports", "mutation", `${pkg}.json`), "utf8"),
  ) as MutantReport;
  const statuses = Object.values(report.files).flatMap((file) =>
    file.mutants.map((mutant) => mutant.status),
  );
  const count = (status: string) => statuses.filter((s) => s === status).length;
  const detected = count("Killed") + count("Timeout");
  const valid = detected + count("Survived") + count("NoCoverage");
  const score = valid === 0 ? 0 : (100 * detected) / valid;
  summary.push(
    `${pkg}: ${score.toFixed(1)}% (${detected} of ${valid} mutants caught, ${count("Survived")} survived)`,
  );
}

console.log(
  `\nMutation score\n${summary.map((line) => `  ${line}`).join("\n")}`,
);
process.exit(failed ? 1 : 0);
