/**
 * Single source of truth for the three identifiers GET /version returns
 * and GET /api-manifest.json echoes. Extracted so both routes read the
 * same values rather than risking two hand-typed copies drifting apart,
 * exactly the class of bug this repo has hit before with stale
 * duplicated metadata (see api-reference/introduction.mdx's Versioning
 * section for what each field means and why they're independent).
 */
export const API_NAME = "Parmana";
export const API_BUILD_VERSION = "0.4.0";
export const API_VERSION = "v1";
