/**
 * Fails when a workspace package's dist/ was not built from its current
 * source. Cross-package tests import workspace packages through dist/, so a
 * stale build runs old code and can pass when the source would fail.
 *
 * The comparison is by content, not timestamps: write-dist-stamps.ts records
 * the source fingerprint in dist/ after each build, and this check recomputes
 * it. Timestamps lie after a git checkout, a copy or a CI cache, and this
 * check must not depend on them (it runs inside Stryker's sandbox copy too).
 *
 * This only detects staleness; it never rebuilds.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SOURCE_STAMP_FILE, sourceFingerprint } from "./source-fingerprint.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Stryker copies the repository into .stryker-tmp/sandbox-* and instruments
// the copied source (it switches mutants on and off there), so the sandbox
// source never matches the stamp, even in the initial run. The real checkout
// was built and stamped before the mutation run started, so the check is
// skipped inside the sandbox. It still runs on every normal test run.
if (root.split(path.sep).includes(".stryker-tmp")) {
  console.log(
    "check-dist-fresh: skipped inside a mutation sandbox (instrumented source is expected to differ).",
  );
  process.exit(0);
}
const packagesDir = path.join(root, "packages");

const stale: { name: string; reason: string }[] = [];

for (const dirName of readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)) {
  const packageDir = path.join(packagesDir, dirName);
  const expected = sourceFingerprint(path.join(packageDir, "src"));

  // Only packages with source are in scope.
  if (expected === undefined) continue;

  let packageName = dirName;
  try {
    packageName = JSON.parse(
      readFileSync(path.join(packageDir, "package.json"), "utf8"),
    ).name;
  } catch {
    // Fall back to the directory name if package.json is unreadable.
  }

  const stampPath = path.join(packageDir, "dist", SOURCE_STAMP_FILE);

  let recorded: string | undefined;
  try {
    statSync(stampPath);
    recorded = readFileSync(stampPath, "utf8").trim();
  } catch {
    recorded = undefined;
  }

  if (recorded === undefined) {
    stale.push({ name: packageName, reason: "dist/ has no source stamp" });
  } else if (recorded !== expected) {
    stale.push({
      name: packageName,
      reason: "dist/ was built from different source",
    });
  }
}

if (stale.length > 0) {
  console.error("check-dist-fresh: stale build output detected.\n");
  for (const { name, reason } of stale) {
    console.error(
      `  dist/ is stale in ${name} (${reason}) — run npm run build:packages.`,
    );
  }
  console.error(
    "\nTests import workspace packages through dist/, not src/. A stale dist/ " +
      "silently runs old code — rebuild before testing.",
  );
  process.exit(1);
}

console.log(
  "check-dist-fresh: all workspace packages' dist/ match their source.",
);
