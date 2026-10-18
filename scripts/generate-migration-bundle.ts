import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  BUNDLE_FILE,
  buildMigrationBundle,
} from "./migrationbundle/buildMigrationBundle.js";

/**
 * Regenerates scripts/apply-all-migrations.sql from supabase/migrations/.
 *
 * Usage: npm run generate:migration-bundle
 */
writeFileSync(join(process.cwd(), BUNDLE_FILE), buildMigrationBundle());

console.log(`${BUNDLE_FILE} regenerated.`);
