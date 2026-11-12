/**
 * Reports execution outcome rows that are still `in_flight` after their
 * authorization expired (the reconciler's stage 1, docs/internal/designs/OUTCOME-RECONCILER.md).
 *
 * Read only. It calls ExecutionOutcomeStore.listStuck and prints the result. It never
 * writes, so running it cannot resolve a row or re-run a connector. A person resolves
 * each row after checking the external system.
 *
 *   DATABASE_URL="..." npx tsx scripts/report-stuck-outcomes.ts          # prints a table
 *   DATABASE_URL="..." npx tsx scripts/report-stuck-outcomes.ts --json   # one JSON document
 *
 * Exit code 0 when the report was produced (even if rows are listed), 1 on error.
 */
import "dotenv/config";

import { PostgresExecutionOutcomeStore } from "../packages/storage/src/postgres/PostgresExecutionOutcomeStore.js";
import { PostgresPoolFactory } from "../packages/storage/src/postgres/PostgresPoolFactory.js";

const asJson = process.argv.includes("--json");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = PostgresPoolFactory.create();

try {
  const now = new Date();
  const stuck = await new PostgresExecutionOutcomeStore(pool).listStuck(now);

  if (asJson) {
    console.log(
      JSON.stringify(
        { generatedAt: now.toISOString(), count: stuck.length, rows: stuck },
        null,
        2,
      ),
    );
  } else if (stuck.length === 0) {
    console.log("No stuck in-flight outcomes.");
  } else {
    console.log(
      `${stuck.length} stuck in-flight outcome(s), authorization expired:`,
    );
    console.log("expiresAt                  nonce");
    for (const row of stuck) {
      console.log(`${row.expiresAt}  ${row.nonce}`);
    }
    console.log(
      "Nothing was changed. Each row needs a person to check the external system.",
    );
  }
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await pool.end();
}
