/**
 * Removes approval nonces whose approvals have expired (G-143, consumed_approval_nonces).
 *
 * An expired approval fails verification on its own, so its nonce no longer protects anything. Keeping the row
 * only grows the table. Run it on a schedule, against the production database, or by hand.
 *
 *   DATABASE_URL="..." npx tsx scripts/prune-approval-nonces.ts          # removes expired rows
 *   DATABASE_URL="..." npx tsx scripts/prune-approval-nonces.ts --dry-run # counts them, removes nothing
 *
 * Exit code 0 on success, 1 on error.
 */
import "dotenv/config";

import { SupabaseApprovalNonceStore } from "../packages/storage/src/supabase/SupabaseApprovalNonceStore.js";
import { PostgresPoolFactory } from "../packages/storage/src/postgres/PostgresPoolFactory.js";

const dryRun = process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = PostgresPoolFactory.create();

try {
  if (dryRun) {
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM consumed_approval_nonces WHERE expires_at < now()",
    );
    console.log(
      `${rows[0].n} expired approval nonce(s) would be removed. Nothing was removed.`,
    );
  } else {
    const removed = await new SupabaseApprovalNonceStore(pool).deleteExpired(
      new Date(),
    );
    console.log(`${removed} expired approval nonce(s) removed.`);
  }
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await pool.end();
}
