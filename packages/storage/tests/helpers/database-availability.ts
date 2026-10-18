/**
 * Whether a real, direct Postgres connection string is configured in
 * the environment. Mirrors packages/api/tests/helpers/
 * database-availability.ts (kept local for the same reason
 * supabase-availability.ts in this same directory stays a separate
 * copy from @parmana/api's — no test-time dependency across the
 * package boundary).
 *
 * Gates the live integration suites for every repository migrated
 * off supabase-js/PostgREST onto PostgresPoolFactory (DATABASE_URL).
 */
export function hasDatabaseUrlConfig(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Resolves whether a DATABASE_URL-gated suite should run, reusing the
 * same ALLOW_LIVE_SUPABASE=1 opt-in resolveSupabaseGate uses in this
 * same directory — both gate "writes against a real, live project,"
 * just via different connections (REST vs. direct Postgres) to the
 * same database.
 */
export function resolveDatabaseGate(suiteLabel: string): boolean {
  const configured = hasDatabaseUrlConfig();
  const optedIn = process.env.ALLOW_LIVE_SUPABASE === "1";

  if (configured && !optedIn) {
    console.log(
      `${suiteLabel}: DATABASE_URL configured but ALLOW_LIVE_SUPABASE=1 ` +
        "not set — skipping live suite. Set ALLOW_LIVE_SUPABASE=1 to run it.",
    );
    return false;
  }

  if (optedIn && !configured) {
    throw new Error(
      `${suiteLabel}: ALLOW_LIVE_SUPABASE=1 is set — a live run was ` +
        "explicitly requested — but DATABASE_URL is not visible to this " +
        "worker — env loading is broken. DATABASE_URL should have been " +
        "loaded by vitest.setup.ts; refusing to silently skip a suite " +
        "that was explicitly asked to run live.",
    );
  }

  if (!configured) {
    console.log(`[SKIP] ${suiteLabel}: DATABASE_URL not set.`);
    return false;
  }

  return true;
}
