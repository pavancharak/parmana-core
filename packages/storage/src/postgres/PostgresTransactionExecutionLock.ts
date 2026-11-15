import type {
  TransactionExecutionLease,
  TransactionExecutionLock,
} from "@parmana/shared";

import type { Pool, PoolClient } from "pg";

/**
 * One lock per business transaction, as a Postgres session-level advisory lock
 * on a dedicated connection (decision D23, design section 7a, decision 4).
 *
 * The two-key form `(namespace, transaction ID hash)` keeps this lock apart
 * from the single-key advisory locks the audit sinks take. The lock is held by
 * the connection, so a lease holds one pool connection until it is released.
 */
const NAMESPACE = "parmana.transaction_execution";
const POLL_INTERVAL_MS = 25;

export class PostgresTransactionExecutionLock implements TransactionExecutionLock {
  constructor(private readonly pool: Pool) {}

  async acquire(
    businessTransactionId: string,
    timeoutMs: number,
  ): Promise<TransactionExecutionLease | null> {
    const client: PoolClient = await this.pool.connect();
    const deadline = Date.now() + timeoutMs;

    try {
      for (;;) {
        const { rows } = await client.query(
          "SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS locked",
          [NAMESPACE, businessTransactionId],
        );

        if (rows[0]?.locked === true) {
          break;
        }

        if (Date.now() >= deadline) {
          client.release();
          return null;
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      client.release(true);
      throw error;
    }

    let released = false;

    return {
      release: async (): Promise<void> => {
        if (released) return;
        released = true;

        try {
          await client.query(
            "SELECT pg_advisory_unlock(hashtext($1), hashtext($2))",
            [NAMESPACE, businessTransactionId],
          );
          client.release();
        } catch {
          // The lock is held by this connection; destroying it ends the session
          // and releases the lock.
          client.release(true);
        }
      },
    };
  }
}
