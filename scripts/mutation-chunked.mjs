// Mutation testing in per-file chunks, so a restart loses only the file in
// progress. Each file's report is saved when that file finishes, and files
// already done are skipped on the next run. When every file is done, the
// per-file reports are merged into reports/mutation/<package>.json, which is
// the file scripts/check-survivor-classification.ts reads.
//
// Usage: node scripts/mutation-chunked.mjs <package>
// Scoring and mutator settings are unchanged: this runs the same
// `npm run mutation` for each file, using STRYKER_MUTATE.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = process.argv[2];
if (!pkg || !/^[a-z0-9-]+$/.test(pkg)) {
  console.error("Usage: node scripts/mutation-chunked.mjs <package>");
  process.exit(2);
}
const srcDir = path.join(root, "packages", pkg, "src");
const reportDir = path.join(root, "reports", "mutation");
mkdirSync(reportDir, { recursive: true });

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (
      name.endsWith(".ts") &&
      !name.endsWith(".d.ts") &&
      name !== "index.ts"
    )
      out.push(p);
  }
  return out;
}

const files = walk(srcDir)
  .map((f) => path.relative(root, f).split(path.sep).join("/"))
  .sort();
console.log(`${new Date().toISOString()} ${pkg}: ${files.length} files`);

// Stryker accepts report names of lowercase letters, digits and hyphens only.
const slugOf = (file) =>
  file
    .replace(/^packages\/[^/]+\/src\//, "")
    .replace(/\.ts$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const slugs = files.map(slugOf);
if (new Set(slugs).size !== slugs.length) {
  console.error("Two files map to the same report name; change slugOf.");
  process.exit(2);
}

for (const file of files) {
  const name = `${pkg}-${slugOf(file)}`;
  const report = path.join(reportDir, `${name}.json`);
  if (existsSync(report)) {
    console.log(`skip (done): ${file}`);
    continue;
  }
  console.log(`${new Date().toISOString()} start: ${file}`);
  const run = spawnSync("npm", ["run", "mutation", "--", pkg], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, STRYKER_MUTATE: file, STRYKER_REPORT_NAME: name },
  });
  if (run.status !== 0 || !existsSync(report)) {
    console.log(
      `${new Date().toISOString()} FAILED: ${file} (exit ${run.status})`,
    );
    process.exit(1);
  }
  console.log(`${new Date().toISOString()} done: ${file}`);
}

// Merge every per-file report into the package report.
const merged = { files: {} };
for (const file of files) {
  const report = path.join(reportDir, `${pkg}-${slugOf(file)}.json`);
  const data = JSON.parse(readFileSync(report, "utf8"));
  Object.assign(merged.files, data.files);
}
const out = path.join(reportDir, `${pkg}.json`);
writeFileSync(out, JSON.stringify(merged));
let total = 0;
const by = {};
for (const entry of Object.values(merged.files)) {
  for (const m of entry.mutants) {
    total++;
    by[m.status] = (by[m.status] ?? 0) + 1;
  }
}
console.log(`${new Date().toISOString()} merged: ${path.relative(root, out)}`);
console.log(`mutants: ${total}`, by);
