/**
 * Writes the source fingerprint of each workspace package into its dist/
 * directory, after a build. check-dist-fresh.ts compares the stamp with the
 * current source, so a dist/ built from an older source is reported as stale
 * whatever its timestamps say.
 *
 * Run after `tsc -b` (see build:packages and build in package.json).
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SOURCE_STAMP_FILE, sourceFingerprint } from "./source-fingerprint.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = path.join(root, "packages");

let stamped = 0;

for (const dirName of readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)) {
  const packageDir = path.join(packagesDir, dirName);
  const fingerprint = sourceFingerprint(path.join(packageDir, "src"));

  if (fingerprint === undefined) continue;

  const distDir = path.join(packageDir, "dist");
  if (!existsSync(distDir)) {
    console.error(
      `write-dist-stamps: packages/${dirName} has no dist/. Run the TypeScript build first.`,
    );
    process.exit(1);
  }

  mkdirSync(distDir, { recursive: true });
  writeFileSync(path.join(distDir, SOURCE_STAMP_FILE), `${fingerprint}\n`);
  stamped += 1;
}

console.log(`write-dist-stamps: stamped ${stamped} package(s).`);
