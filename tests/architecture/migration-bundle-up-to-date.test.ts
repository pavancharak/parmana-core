import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BUNDLE_FILE,
  buildMigrationBundle,
} from "../../scripts/migrationbundle/buildMigrationBundle.js";

const repoRoot = process.cwd();

describe("scripts/apply-all-migrations.sql is up to date", () => {
  it("matches a fresh build from supabase/migrations", () => {
    const committed = readFileSync(join(repoRoot, BUNDLE_FILE), "utf8");

    expect(
      committed,
      "Run `npm run generate:migration-bundle` and commit the result.",
    ).toBe(buildMigrationBundle());
  });
});
