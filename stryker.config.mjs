// Mutation testing for one package at a time: npm run mutation -- <package>
// (scripts/mutation.ts sets STRYKER_PACKAGE).
//
// Optional settings for a targeted run on part of a package:
//   STRYKER_MUTATE       comma-separated .ts files under packages/<package>/src
//                        to mutate instead of the whole package.
//   STRYKER_REPORT_NAME  name for the report files, so a targeted run does
//                        not overwrite the whole-package report.
//
// Stryker changes one thing in the package's source at a time (a mutant)
// and runs that package's own tests, which import its src directly. A
// mutant the tests catch is "killed"; one they miss "survived".
//
// The command runner is used, not @stryker-mutator/vitest-runner: under
// Vitest 5 that plugin never switches a mutant on, so every mutant
// "survives". The command runner switches it on through the
// __STRYKER_ACTIVE_MUTANT__ environment variable, which works.
import { existsSync } from "node:fs";

const pkg = process.env.STRYKER_PACKAGE;
if (!pkg) throw new Error("Run through `npm run mutation -- <package>`.");
if (!/^[a-z0-9-]+$/.test(pkg)) throw new Error(`Invalid package name: ${pkg}`);

const reportName = process.env.STRYKER_REPORT_NAME ?? pkg;
if (!/^[a-z0-9-]+$/.test(reportName)) {
  throw new Error(`Invalid STRYKER_REPORT_NAME: ${reportName}`);
}

const srcPrefix = `packages/${pkg}/src/`;

const targeted = process.env.STRYKER_MUTATE
  ? process.env.STRYKER_MUTATE.split(",")
      .map((file) => file.trim())
      .filter((file) => file !== "")
  : undefined;

if (targeted !== undefined) {
  if (targeted.length === 0) {
    throw new Error("STRYKER_MUTATE is set but names no files.");
  }
  for (const file of targeted) {
    if (!file.startsWith(srcPrefix) || file.includes("..") || !file.endsWith(".ts")) {
      throw new Error(`STRYKER_MUTATE must list .ts files under ${srcPrefix}: ${file}`);
    }
    if (!existsSync(file)) {
      throw new Error(`STRYKER_MUTATE file does not exist: ${file}`);
    }
  }
}

const mutate = targeted ?? [`${srcPrefix}**/*.ts`, `!${srcPrefix}**/index.ts`];

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "command",
  commandRunner: { command: `npx vitest run packages/${pkg} --reporter=dot` },
  mutate,
  coverageAnalysis: "off",
  reporters: ["clear-text", "progress", "json", "html"],
  jsonReporter: { fileName: `reports/mutation/${reportName}.json` },
  htmlReporter: { fileName: `reports/mutation/${reportName}.html` },
  ignorePatterns: [
    "docs/site/*.pdf",
    "docs/site/llms-full.txt",
    "reports",
    "**/.venv",
  ],
  tempDirName: ".stryker-tmp",
  concurrency: 4,
  timeoutMS: 60000,
};
