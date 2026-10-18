/**
 * Parmana TypeScript SDK
 *
 * SDK version, read from this package's own package.json at runtime so
 * it can never drift from the published version. Works both from source
 * (src/version.ts, package.json one directory up) and from the compiled
 * dist/ output (dist/version.js, package.json still one directory up —
 * npm always includes package.json in the published tarball regardless
 * of the "files" field).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface PackageJson {
  version: string;
}

const packageJsonPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "package.json",
);

const packageJson = JSON.parse(
  readFileSync(packageJsonPath, "utf8"),
) as PackageJson;

export const VERSION: string = packageJson.version;
