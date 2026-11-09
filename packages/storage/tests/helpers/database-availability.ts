/**
 * Whether a validated test database is configured. Mirrors packages/api/tests/helpers/
 * database-availability.ts (kept local for the same reason supabase-availability.ts in this
 * same directory stays a separate copy from @parmana/api's — no test-time dependency across
 * the package boundary).
 *
 * Reads TEST_DATABASE_URL. vitest.setup.ts validates the target before any suite runs, and
 * sets TEST_DATABASE_URL to it (docs/internal/designs/TEST-DATABASE-CONFIG.md, step 5).
 *
 * Gates the live integration suites for every repository migrated off supabase-js/PostgREST
 * onto PostgresPoolFactory.
 */
export function hasDatabaseUrlConfig(): boolean {
  return Boolean(process.env.TEST_DATABASE_URL?.trim());
}

/**
 * Resolves whether a database-gated suite should run, reusing the same ALLOW_LIVE_SUPABASE=1
 * opt-in resolveSupabaseGate uses in this same directory — both gate "writes against a real,
 * live project," just via different connections (REST vs. direct Postgres) to the same database.
 */
export function resolveDatabaseGate(suiteLabel: string): boolean {
  const configured = hasDatabaseUrlConfig();
  const optedIn = process.env.ALLOW_LIVE_SUPABASE === "1";

  if (configured && !optedIn) {
    console.log(
      `${suiteLabel}: TEST_DATABASE_URL configured but ALLOW_LIVE_SUPABASE=1 ` +
        "not set — skipping live suite. Set ALLOW_LIVE_SUPABASE=1 to run it.",
    );
    return false;
  }

  if (optedIn && !configured) {
    throw new Error(
      `${suiteLabel}: ALLOW_LIVE_SUPABASE=1 is set — a live run was ` +
        "explicitly requested — but TEST_DATABASE_URL is not visible to this " +
        "worker — env loading is broken. TEST_DATABASE_URL should have been " +
        "set by vitest.setup.ts; refusing to silently skip a suite " +
        "that was explicitly asked to run live.",
    );
  }

  if (!configured) {
    console.log(`[SKIP] ${suiteLabel}: TEST_DATABASE_URL not set.`);
    return false;
  }

  return true;
}
