import "dotenv/config";

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  FilePolicyRepository,
  SupabasePolicyRepository,
} from "@parmana/policy";
import { PostgresPoolFactory } from "@parmana/storage";

const MIGRATION_FILE = path.resolve(
  process.cwd(),
  "supabase/migrations/20260916060000_add_policies_table.sql",
);

/**
 * One-time cutover for the `policies` table (migration 20260916060000):
 * creates the table, then copies every policy currently on disk
 * (under PARMANA_POLICY_DIR) into it. Run once, before/at the same
 * time as deploying the SupabasePolicyRepository switch in
 * application.ts -- application.ts's own doc comment explains why a
 * single shared repository backs both governance writes and live
 * runtime policy evaluation, so a gap here (any policy present as a
 * file but missing from this table) would 404 real traffic hitting
 * that policy the moment the switch goes live.
 */
async function main(): Promise<void> {
  const pool = PostgresPoolFactory.create();

  const migrationSql = readFileSync(MIGRATION_FILE, "utf8");

  console.log("Applying migration 20260916060000_add_policies_table.sql...");
  await pool.query(migrationSql);
  console.log("Table created (or already existed).\n");

  const fileRepo = new FilePolicyRepository(
    process.env.PARMANA_POLICY_DIR ?? "./policies",
  );
  const dbRepo = new SupabasePolicyRepository(pool);

  const policies = await fileRepo.listAll();
  console.log(`Found ${policies.length} policies on disk. Backfilling...\n`);

  for (const { name, version } of policies) {
    const content = await fileRepo.load(name, version);
    await dbRepo.save(name, version, content);
    console.log(`  ✓ ${name}@${version}`);
  }

  console.log(
    `\nBackfilled ${policies.length} policies into the 'policies' table.`,
  );

  await pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
