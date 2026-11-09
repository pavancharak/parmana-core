/**
 * Whether a validated test database is configured. Mirrors supabase-availability.ts's shape
 * exactly, but gates the two audit-sink integration tests that now write via PostgresPoolFactory
 * instead of a supabase-js/PostgREST client (SUPABASE_URL) — see PostgresCallerAuditSink /
 * SupabaseRazorpayWebhookAuditSink for why (temporary PostgREST schema-cache workaround,
 * Supabase ticket SU-437429).
 *
 * Reads TEST_DATABASE_URL. vitest.setup.ts validates the target before any suite runs, and
 * sets TEST_DATABASE_URL to it (docs/internal/designs/TEST-DATABASE-CONFIG.md, step 5).
 */
export function hasDatabaseUrlConfig(): boolean {
  return Boolean(process.env.TEST_DATABASE_URL?.trim());
}

/**
 * Resolves whether a database-gated suite should run, reusing the same ALLOW_LIVE_SUPABASE=1
 * opt-in as resolveSupabaseGate — both gate "writes against a real, live project," just via
 * different connections (REST vs. direct Postgres) to the same database.
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
    console.log(
      `[SKIP] ${suiteLabel}: TEST_DATABASE_URL not set. See ` +
        "packages/api/README.md to enable this suite.",
    );
    return false;
  }

  return true;
}
