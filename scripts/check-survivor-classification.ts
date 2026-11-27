/**
 * Checks that every mutation survivor has a classification.
 *
 * Reads reports/mutation/<package>.json (written by `npm run mutation`) and
 * docs/assurance/survivors/<package>.md, a table with one row per survivor:
 *
 *   | id | class | rationale |
 *
 * Class is one of: missing test, insufficient assertion, equivalent,
 * unreachable, out of scope.
 *
 * Usage:
 *   npx tsx scripts/check-survivor-classification.ts <package> [--strict]
 *
 * Default: prints the counts and exits 0 (non-blocking).
 * --strict: exits 1 if any survivor is unclassified or a classification
 * names an id that no longer survives. Not yet wired into CI; see
 * docs/assurance/EXECUTION_PLAN.md section 9.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CLASSES = new Set([
  "missing test",
  "insufficient assertion",
  "equivalent",
  "unreachable",
  "out of scope",
]);

interface Mutant {
  status: string;
  mutatorName: string;
  location: { start: { line: number } };
}

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const pkg = args.find((a) => !a.startsWith("--"));
if (!pkg || !/^[a-z0-9-]+$/.test(pkg)) {
  console.error("Usage: check-survivor-classification.ts <package> [--strict]");
  process.exit(2);
}

const reportPath = path.join(root, "reports", "mutation", `${pkg}.json`);
if (!existsSync(reportPath)) {
  console.error(
    `No report at ${path.relative(root, reportPath)}. Run npm run mutation -- ${pkg}.`,
  );
  process.exit(2);
}

const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
  files: Record<string, { mutants: Mutant[] }>;
};

// Stable id: file, line, mutator. A repeat on the same line gets #2, #3, ...
const survivors = new Set<string>();
for (const [file, entry] of Object.entries(report.files)) {
  const seen = new Map<string, number>();
  for (const m of entry.mutants) {
    if (m.status !== "Survived") continue;
    const base = `${file}:${m.location.start.line}:${m.mutatorName}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    survivors.add(n === 1 ? base : `${base}#${n}`);
  }
}

const classFile = path.join(
  root,
  "docs",
  "assurance",
  "survivors",
  `${pkg}.md`,
);
const classified = new Map<string, string>();
if (existsSync(classFile)) {
  for (const line of readFileSync(classFile, "utf8").split("\n")) {
    const cells = line.split("|").map((c) => c.trim().replace(/^`|`$/g, ""));
    if (cells.length < 4 || !cells[1]) continue;
    if (CLASSES.has(cells[2])) classified.set(cells[1], cells[2]);
  }
}

const unclassified = [...survivors].filter((id) => !classified.has(id));
const stale = [...classified.keys()].filter((id) => !survivors.has(id));
console.log(`package:        ${pkg}`);
console.log(`survivors:      ${survivors.size}`);
console.log(
  `classified:     ${survivors.size - unclassified.length} of ${survivors.size}`,
);
console.log(`unclassified:   ${unclassified.length}`);
console.log(`stale entries:  ${stale.length}`);
console.log(
  `class file:     ${path.relative(root, classFile)}${existsSync(classFile) ? "" : " (missing)"}`,
);

if (strict && (unclassified.length > 0 || stale.length > 0)) {
  for (const id of unclassified.slice(0, 20))
    console.log(`  unclassified: ${id}`);
  for (const id of stale.slice(0, 20)) console.log(`  stale: ${id}`);
  process.exit(1);
}
