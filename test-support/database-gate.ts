/**
 * The one gate for database-backed test suites. packages/api and packages/storage
 * both re-export it from their tests/helpers/database-availability.ts, so the two
 * copies cannot drift.
 *
 * Without PARMANA_REQUIRE_DATABASE=1, a suite skips when no database is configured.
 * That is the default for a developer machine.
 *
 * With PARMANA_REQUIRE_DATABASE=1 (set for the CI build-and-test job), a suite that
 * would skip fails instead. A run that reports "passed" therefore means the database
 * suites actually ran, not that they were skipped.
 *
 * TEST_DATABASE_URL is validated by vitest.setup.ts before any suite runs
 * (test-support/database-target.ts). The ALLOW_LIVE_SUPABASE=1 opt-in is the
 * existing switch that lets a configured database run.
 */

export function databaseRequired(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.PARMANA_REQUIRE_DATABASE === "1";
}

export function hasDatabaseUrlConfig(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.TEST_DATABASE_URL?.trim());
}

export function resolveDatabaseGate(
  suiteLabel: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const configured = hasDatabaseUrlConfig(env);
  const optedIn = env.ALLOW_LIVE_SUPABASE === "1";

  if (databaseRequired(env) && (!configured || !optedIn)) {
    const missing = !configured
      ? "TEST_DATABASE_URL is not set"
      : "ALLOW_LIVE_SUPABASE=1 is not set";
    throw new Error(
      `${suiteLabel}: PARMANA_REQUIRE_DATABASE=1 is set, so this database suite ` +
        `must run, but ${missing}. A skipped database suite fails the run. ` +
        "Set TEST_DATABASE_URL and ALLOW_LIVE_SUPABASE=1, or unset PARMANA_REQUIRE_DATABASE " +
        "on a machine without a database.",
    );
  }

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
