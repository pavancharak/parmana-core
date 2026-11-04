import { readFileSync } from "node:fs";

import { Pool } from "pg";

/** A plain, unquoted Postgres identifier: lowercase letters, digits and underscores. */
const SCHEMA_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * TLS options for the pool. The CA certificate of the database comes from
 * either PARMANA_DATABASE_CA_FILE (a PEM file) or PARMANA_DATABASE_CA (the PEM
 * text itself), never both. With it set, the server verifies
 * the database's certificate against that CA, and refuses a connection that
 * does not verify. Unset, the pool uses the sslmode in DATABASE_URL and the
 * system trust store, as before.
 *
 * Fails closed: a file that cannot be read, or that holds no certificate,
 * stops the pool from being created. The file path is named in the error;
 * the contents are never printed.
 */
export function databaseSslOptions(
  env: Readonly<Record<string, string | undefined>>,
  readFile: (path: string) => string = (path) => readFileSync(path, "utf8"),
): { ssl?: { ca: string; rejectUnauthorized: true } } {
  const path = env.PARMANA_DATABASE_CA_FILE;
  const text = env.PARMANA_DATABASE_CA;
  const hasPath = path !== undefined && path.trim() !== "";
  const hasText = text !== undefined && text.trim() !== "";

  if (hasPath && hasText) {
    throw new Error(
      "Set PARMANA_DATABASE_CA_FILE or PARMANA_DATABASE_CA, not both.",
    );
  }
  if (!hasPath && !hasText) {
    return {};
  }

  let pem: string;
  if (hasText) {
    // Hosts that take environment variables only cannot hold a file, so
    // the certificate text is accepted here. Literal \n become line breaks.
    pem = (text as string).replace(/\\n/g, "\n");
  } else {
    try {
      pem = readFile(path as string);
    } catch {
      throw new Error(`PARMANA_DATABASE_CA_FILE cannot be read: ${path}`);
    }
  }

  if (!pem.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error(
      hasText
        ? "PARMANA_DATABASE_CA does not hold a PEM certificate"
        : `PARMANA_DATABASE_CA_FILE does not hold a PEM certificate: ${path}`,
    );
  }

  return { ssl: { ca: pem, rejectUnauthorized: true } };
}

/**
 * The connection string without its SSL parameters. With PARMANA_DATABASE_CA_FILE
 * set, these are removed, so a sslmode in DATABASE_URL cannot override the CA
 * check. Without this, sslmode=disable in the URL would send the connection
 * unencrypted, and sslmode=require would ignore the CA file.
 */
export function withoutSslParams(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslrootcert");
  url.searchParams.delete("uselibpqcompat");
  return url.toString();
}

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

    // PARMANA_DB_SCHEMA puts this process on another schema of the same
    // database, such as the sandbox's own schema alongside the connector's.
    // Unset or empty keeps the default search path, so existing deployments
    // are unchanged.
    const schema = process.env.PARMANA_DB_SCHEMA;

    if (schema !== undefined && schema !== "" && !SCHEMA_NAME.test(schema)) {
      throw new Error(
        "PARMANA_DB_SCHEMA must be a plain Postgres name, such as parmana_sandbox.",
      );
    }

    const tls = databaseSslOptions(process.env);

    this.pool = new Pool({
      connectionString: tls.ssl
        ? withoutSslParams(connectionString)
        : connectionString,
      ...tls,
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
      ...(schema ? { options: `-c search_path=${schema}` } : {}),
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
