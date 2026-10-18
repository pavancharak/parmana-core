import { Pool } from "pg";

/**
 * Lazy, process-wide singleton Postgres connection pool. Connects
 * directly to Postgres (via `pg`) instead of going through
 * supabase-js's REST-based client (PostgREST) -- the class that once
 * provided that client, SupabaseClientFactory, was deleted 2026-09-09
 * (docs/VERIFICATION-GAPS.md G-34) after this factory's own pattern
 * had already replaced it everywhere it was still used.
 *
 * Introduced as the stopgap direct-Postgres path for
 * SupabaseCallerAuditSink (see that file for why) — not itself tied
 * to that workaround, so any other call site needing a raw Postgres
 * connection to the same
 * database should reuse this factory rather than opening its own
 * pool.
 *
 * SSL: relies on DATABASE_URL's own `sslmode` query parameter (`pg`
 * parses it via `pg-connection-string`); Supabase connection strings
 * already include `sslmode=require`.
 */
export class PostgresPoolFactory {
  private static pool: Pool | undefined;

  static create(): Pool {
    if (this.pool) {
      return this.pool;
    }

    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is missing.");
    }

    this.pool = new Pool({
      connectionString,
      min: 1,
      keepAlive: true,

      // Without this, an unreachable/misconfigured DATABASE_URL hangs
      // a connecting query indefinitely instead of failing fast --
      // found via examples/tutorials/89-readiness-probe/run.ts's own
      // "genuinely unreachable Supabase backend" scenario, which never
      // returned before this was added. 5s is generous for any real,
      // reachable Postgres instance (same-region Supabase connections
      // resolve in well under 1s) and short enough that a readiness
      // check or a real outage surfaces promptly instead of tying up
      // the caller.
      connectionTimeoutMillis: 5000,
    });

    // Best-effort warm-up: opens the first connection immediately
    // instead of on the first real query. A failure here doesn't
    // prevent the pool from being used -- the query that actually
    // needs a connection will surface its own error.
    this.pool
      .connect()
      .then((client) => client.release())
      .catch(() => {});

    return this.pool;
  }
}
