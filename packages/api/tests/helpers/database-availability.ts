/**
 * Whether a real, direct Postgres connection string is configured in
 * the environment. Mirrors supabase-availability.ts's shape exactly,
 * but gates the two audit-sink integration tests that now write via
 * PostgresPoolFactory (DATABASE_URL) instead of a supabase-js/PostgREST
 * client (SUPABASE_URL) — see SupabaseCallerAuditSink /
 * SupabaseRazorpayWebhookAuditSink for why (temporary PostgREST
 * schema-cache workaround, Supabase ticket SU-437429).
 */
export function hasDatabaseUrlConfig(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Resolves whether a DATABASE_URL-gated suite should run, reusing the
 * same ALLOW_LIVE_SUPABASE=1 opt-in as resolveSupabaseGate — both gate
 * "writes against a real, live project," just via different
 * connections (REST vs. direct Postgres) to the same database.
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
    console.log(
      `[SKIP] ${suiteLabel}: DATABASE_URL not set. See ` +
        "packages/api/README.md to enable this suite.",
    );
    return false;
  }

  return true;
}
