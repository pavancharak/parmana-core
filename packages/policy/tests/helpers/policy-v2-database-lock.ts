import type { Pool, PoolClient } from "pg";

/**
 * The policy version 2 live suites share their tables, and each truncates them. Vitest runs
 * files in parallel, so each suite holds this database-wide lock for its whole run. Another
 * suite waits on the lock instead of truncating tables under it.
 */

/** A fixed key for the lock, distinct from the production advisory locks. */
const POLICY_V2_SUITE_LOCK = 0x70_76_32_74; // "pv2t"

/** Takes the lock. Keep the returned client, and release it with releasePolicyV2SuiteLock. */
export async function acquirePolicyV2SuiteLock(
  pool: Pool,
): Promise<PoolClient> {
  const client = await pool.connect();
  await client.query("SELECT pg_advisory_lock($1)", [POLICY_V2_SUITE_LOCK]);
  return client;
}

/** Releases the lock and returns the connection to the pool. */
export async function releasePolicyV2SuiteLock(
  client: PoolClient,
): Promise<void> {
  try {
    await client.query("SELECT pg_advisory_unlock($1)", [POLICY_V2_SUITE_LOCK]);
  } finally {
    client.release();
  }
}
