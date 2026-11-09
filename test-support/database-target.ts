/**
 * Decides which database the test run may write to. See
 * docs/internal/designs/TEST-DATABASE-CONFIG.md (decisions D3, D4, D5).
 *
 * Rules, in order:
 *   1. No test database URL: "none". Database suites skip.
 *   2. A local host (127.0.0.1, localhost, ::1): "local". No opt-in needed.
 *   3. Any other host is hosted and must name a Supabase project:
 *      - the project must be on PARMANA_TEST_PROJECT_REFS (an empty list refuses every hosted target);
 *      - the project must not be on PARMANA_PRODUCTION_PROJECT_REFS;
 *      - ALLOW_LIVE_SUPABASE must be "1".
 *
 * Errors never include the connection string, only the reason and, where it is safe, the project ID.
 */

export type DatabaseTarget =
  | { kind: "none" }
  | { kind: "local"; url: string }
  | { kind: "hosted"; url: string; projectRef: string };

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Splits a comma-separated list of project IDs, trimming blanks. */
export function parseProjectRefs(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Returns the Supabase project ID a connection string points at, or undefined if it does not name one.
 * Two forms are recognised: the direct host `db.<ref>.supabase.co`, and the pooler user `postgres.<ref>`.
 */
export function projectRefOf(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(parsed.hostname);
  if (direct) return direct[1];
  const pooled = /^postgres\.([a-z0-9]+)$/.exec(
    decodeURIComponent(parsed.username),
  );
  if (pooled) return pooled[1];
  return undefined;
}

function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * The target for one connection string. Callers validate every database variable a test could read, not only the one
 * they will use, so a hosted value in DATABASE_URL is checked even when TEST_DATABASE_URL is local.
 */
export function resolveDatabaseUrlTarget(
  rawUrl: string,
  env: NodeJS.ProcessEnv,
): DatabaseTarget {
  const url = rawUrl.trim();
  if (url === "") return { kind: "none" };

  try {
    new URL(url);
  } catch {
    throw new Error("test database URL is not a valid URL (value not shown)");
  }

  if (isLocalUrl(url)) return { kind: "local", url };

  const projectRef = projectRefOf(url);
  if (projectRef === undefined) {
    throw new Error(
      "test database URL is hosted but does not name a Supabase project (expected host db.<ref>.supabase.co or user postgres.<ref>); refusing to run",
    );
  }

  const allowed = parseProjectRefs(env.PARMANA_TEST_PROJECT_REFS);
  if (allowed.length === 0) {
    throw new Error(
      "PARMANA_TEST_PROJECT_REFS is empty, so no hosted test database is allowed; refusing to run",
    );
  }
  if (
    parseProjectRefs(env.PARMANA_PRODUCTION_PROJECT_REFS).includes(projectRef)
  ) {
    throw new Error(
      `project ${projectRef} is a production project; refusing to run`,
    );
  }
  if (!allowed.includes(projectRef)) {
    throw new Error(
      `project ${projectRef} is not on PARMANA_TEST_PROJECT_REFS; refusing to run`,
    );
  }
  if (env.ALLOW_LIVE_SUPABASE !== "1") {
    throw new Error(
      `project ${projectRef} is hosted: set ALLOW_LIVE_SUPABASE=1 to run against it`,
    );
  }

  return { kind: "hosted", url, projectRef };
}

/**
 * The target a run will use: TEST_DATABASE_URL when it is non-empty, otherwise DATABASE_URL.
 * An empty string counts as unset, so the template's blank TEST_DATABASE_URL falls through.
 */
export function resolveDatabaseTarget(env: NodeJS.ProcessEnv): DatabaseTarget {
  const url = env.TEST_DATABASE_URL?.trim() || env.DATABASE_URL?.trim() || "";
  return resolveDatabaseUrlTarget(url, env);
}
