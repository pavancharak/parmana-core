import type { Pool } from "pg";

/**
 * Inserts one business_transactions row with every NOT NULL column set.
 *
 * Tests that need a parent row for other tables (transaction_status_events,
 * approvals, and so on) call this instead of writing their own INSERT. The
 * column list is taken from supabase/migrations/20260629013035_initial_schema.sql.
 * If the schema adds a required column, this one function changes, not every
 * test that inserts a transaction.
 */
export async function insertBusinessTransaction(
  pool: Pick<Pool, "query">,
  businessTransactionId: string,
  status = "RECEIVED",
): Promise<void> {
  await pool.query(
    `INSERT INTO business_transactions
       (business_transaction_id, status, authority_json, authorization_json,
        intent_json, metadata_json, policy_json, signals_json, created_at)
     VALUES ($1, $2, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
             '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, now())`,
    [businessTransactionId, status],
  );
}
