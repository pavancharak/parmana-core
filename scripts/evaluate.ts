/**
 * `npm run evaluate`: runs the security evaluation scenarios in
 * evaluations/scenarios.json and reports, for each attack, whether the
 * invariant held.
 *
 * Each scenario names test files. The runner runs all of them once with
 * Vitest, then marks a scenario:
 *
 *   BLOCKED  every test in its files ran and passed
 *   FAILED   at least one test in its files failed
 *   NOT RUN  a file is missing, or ran no passing test
 *
 * It prints a table and writes evaluation-report.json (gitignored) with the
 * commit, the Node.js version, a hash of the policies, and each test file's
 * hash and counts, so a result can be tied to exactly what was run. It exits
 * 1 unless every scenario is BLOCKED.
 *
 * `npm run evaluate -- EV-04 EV-05` runs only the scenarios named.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface Scenario {
  id: string;
  slug: string;
  title: string;
  attackerControls: string;
  attack: string;
  invariant: string;
  claims: string[];
  tests: string[];
}

interface FileCounts {
  passed: number;
  failed: number;
  skipped: number;
}

interface VitestJsonReport {
  testResults: {
    name: string;
    assertionResults: { status: string }[];
  }[];
}

type Result = "BLOCKED" | "FAILED" | "NOT RUN";

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function git(args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

/** One hash over every policy.json under policies/, in sorted path order. */
function policiesHash(): string {
  const hash = createHash("sha256");
  const files = listFiles(path.join(root, "policies"))
    .filter((file) => path.basename(file) === "policy.json")
    .map((file) => path.relative(root, file).split(path.sep).join("/"))
    .sort();
  for (const file of files) {
    hash.update(`${file}\n`);
    hash.update(readFileSync(path.join(root, file)));
  }
  return hash.digest("hex");
}

function loadScenarios(): Scenario[] {
  const registry = JSON.parse(
    readFileSync(path.join(root, "evaluations/scenarios.json"), "utf8"),
  ) as { scenarios: Scenario[] };
  return registry.scenarios;
}

function runVitest(files: string[]): Map<string, FileCounts> {
  const outDir = mkdtempSync(path.join(tmpdir(), "parmana-evaluate-"));
  const outputFile = path.join(outDir, "vitest.json");
  try {
    // On Windows npx is a .cmd file, which needs a shell. Every argument is
    // a fixed string or a repository path from the registry, never user input.
    const result = spawnSync(
      "npx",
      [
        "vitest",
        "run",
        ...files,
        "--reporter=json",
        `--outputFile=${outputFile}`,
      ],
      {
        cwd: root,
        stdio: ["ignore", "ignore", "inherit"],
        shell: process.platform === "win32",
      },
    );
    if (!existsSync(outputFile)) {
      throw new Error(
        `Vitest produced no report (exit status ${result.status ?? "none"}).`,
      );
    }
    const report = JSON.parse(
      readFileSync(outputFile, "utf8"),
    ) as VitestJsonReport;
    const counts = new Map<string, FileCounts>();
    for (const file of report.testResults) {
      const relative = path.relative(root, file.name).split(path.sep).join("/");
      const fileCounts: FileCounts = { passed: 0, failed: 0, skipped: 0 };
      for (const assertion of file.assertionResults) {
        if (assertion.status === "passed") fileCounts.passed += 1;
        else if (assertion.status === "failed") fileCounts.failed += 1;
        else fileCounts.skipped += 1;
      }
      counts.set(relative, fileCounts);
    }
    return counts;
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

function resultFor(tests: { counts: FileCounts | null }[]): Result {
  if (tests.some((test) => test.counts !== null && test.counts.failed > 0))
    return "FAILED";
  if (tests.some((test) => test.counts === null || test.counts.passed === 0))
    return "NOT RUN";
  return "BLOCKED";
}

/**
 * Scenario ids given on the command line (`npm run evaluate -- EV-04 EV-05`)
 * select those scenarios; none selects all. An unknown id is an error, so a
 * typo never reports a smaller set as all blocked.
 */
function selectScenarios(all: Scenario[], ids: string[]): Scenario[] {
  if (ids.length === 0) return all;
  const known = new Set(all.map((scenario) => scenario.id));
  const unknown = ids.filter((id) => !known.has(id.toUpperCase()));
  if (unknown.length > 0) {
    console.error(
      `Unknown scenario: ${unknown.join(", ")}. Known: ${[...known].join(", ")}.`,
    );
    process.exit(2);
  }
  const wanted = new Set(ids.map((id) => id.toUpperCase()));
  return all.filter((scenario) => wanted.has(scenario.id));
}

function main(): void {
  const scenarios = selectScenarios(loadScenarios(), process.argv.slice(2));
  const files = [
    ...new Set(scenarios.flatMap((scenario) => scenario.tests)),
  ].sort();
  const present = files.filter((file) => existsSync(path.join(root, file)));

  console.log(
    `Running ${scenarios.length} attack scenarios (${present.length} test files)...\n`,
  );
  const counts =
    present.length > 0 ? runVitest(present) : new Map<string, FileCounts>();

  const results = scenarios.map((scenario) => {
    const tests = scenario.tests.map((file) => {
      const full = path.join(root, file);
      return {
        file,
        sha256: existsSync(full) ? sha256(readFileSync(full)) : null,
        counts: counts.get(file) ?? null,
      };
    });
    return { ...scenario, result: resultFor(tests), tests };
  });

  const idWidth = Math.max(...results.map((r) => r.id.length));
  const titleWidth = Math.max(...results.map((r) => r.title.length));
  for (const r of results) {
    const passed = r.tests.reduce(
      (sum, test) => sum + (test.counts?.passed ?? 0),
      0,
    );
    const failed = r.tests.reduce(
      (sum, test) => sum + (test.counts?.failed ?? 0),
      0,
    );
    const detail = failed > 0 ? `${failed} failed` : `${passed} tests`;
    console.log(
      `${r.id.padEnd(idWidth)}  ${r.title.padEnd(titleWidth)}  ${r.result.padEnd(7)}  ${detail}`,
    );
  }

  for (const r of results.filter((r) => r.result !== "BLOCKED")) {
    console.log(`\n${r.id} ${r.result}: ${r.invariant}`);
    for (const test of r.tests) {
      const state =
        test.counts === null
          ? test.sha256 === null
            ? "missing"
            : "no results"
          : `${test.counts.passed} passed, ${test.counts.failed} failed`;
      console.log(`  ${test.file}: ${state}`);
    }
  }

  const blocked = results.filter((r) => r.result === "BLOCKED").length;
  const report = {
    generatedAt: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]),
    workingTreeClean: git(["status", "--porcelain"]) === "",
    node: process.version,
    policiesSha256: policiesHash(),
    summary: { scenarios: results.length, blocked },
    scenarios: results,
  };
  writeFileSync(
    path.join(root, "evaluation-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  console.log(
    `\n${blocked} of ${results.length} attacks blocked. Report: evaluation-report.json`,
  );
  if (blocked !== results.length) process.exit(1);
}

main();
