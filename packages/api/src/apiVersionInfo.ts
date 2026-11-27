/**
 * Single source of truth for the three identifiers GET /version returns
 * and GET /api-manifest.json echoes. Extracted so both routes read the
 * same values rather than risking two hand-typed copies drifting apart,
 * exactly the class of bug this repo has hit before with stale
 * duplicated metadata (see api-reference/introduction.mdx's Versioning
 * section for what each field means and why they're independent).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const API_NAME = "Parmana";

/**
 * The deployment build identifier. It is the @parmana/api package version,
 * read at runtime from this package's own package.json, so it cannot drift
 * from the published version. It is not the REST API version (see API_VERSION).
 * Works from source (src/) and from compiled output (dist/).
 */
const apiPackageJson = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"),
    "utf8",
  ),
) as { version: string };
export const API_BUILD_VERSION: string = apiPackageJson.version;
export const API_VERSION = "v1";
