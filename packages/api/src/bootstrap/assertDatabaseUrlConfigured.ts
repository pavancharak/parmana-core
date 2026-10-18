/**
 * Fail-closed precondition for the audit sink that currently bypasses
 * supabase-js and writes via a direct Postgres connection
 * (SupabaseCallerAuditSink — see that file for why: PostgREST's
 * schema cache is stuck, Supabase ticket SU-437429). Mirrors
 * assertSupabaseConfigured.ts's shape:
 * throws a clear, actionable error naming the missing environment
 * variable rather than letting PostgresPoolFactory.create() fail
 * later with its generic "DATABASE_URL environment variable is
 * missing." message, or — worse — constructing a pool that only
 * fails on first use.
 */
export function assertDatabaseUrlConfigured(storeName: string): void {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      `Durable ${storeName} requires DATABASE_URL (a direct Postgres ` +
        "connection string — see Settings → Database → Connection string " +
        "in the Supabase dashboard) to be configured. Refusing to start " +
        `with no persistent ${storeName} — an in-memory implementation ` +
        "must never be used in production (G-13).",
    );
  }
}
