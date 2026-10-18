import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Builds scripts/apply-all-migrations.sql: every file in supabase/migrations/,
 * in filename order, unmodified, behind one shared header. It is for people who
 * apply the schema by pasting one file into the Supabase SQL Editor.
 *
 * The CLI (scripts/generate-migration-bundle.ts) writes the file.
 * tests/architecture/migration-bundle-up-to-date.test.ts fails when the
 * committed file differs from this output, so a new migration cannot be added
 * without the bundle following.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export const MIGRATIONS_DIRECTORY = "supabase/migrations";
export const BUNDLE_FILE = "scripts/apply-all-migrations.sql";

const RULE =
  "-- =============================================================================";

export function buildMigrationBundle(): string {
  const header = readFileSync(
    join(repoRoot, "scripts", "migrationbundle", "header.txt"),
    "utf8",
  );

  const files = readdirSync(join(repoRoot, MIGRATIONS_DIRECTORY))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const blocks = files.map((name) => {
    const content = readFileSync(
      join(repoRoot, MIGRATIONS_DIRECTORY, name),
      "utf8",
    ).trimEnd();

    return `${RULE}\n-- Source: ${MIGRATIONS_DIRECTORY}/${name}\n${content}\n`;
  });

  return header + blocks.join("\n\n");
}
