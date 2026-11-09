/**
 * Online checks for the configuration doctor (stage 3). Run with --online.
 *
 * Each check uses the same probe the server uses at readiness or startup:
 * the database query behind GET /ready, and the key lookup behind
 * assertKmsSigningKeyReachable. Nothing is
 * written. Dependencies are passed in, so the checks can be tested without a
 * database, a KMS key or a network.
 *
 * Errors are reported by code only. A database or AWS error message can name
 * a host, a role or an ARN, and a connection string can hold a password.
 */
import type { DoctorCheck } from "@parmana/shared";

/** Reads the rows of a query. The CLI supplies the real database, using the same factory as the server. */
export type DatabaseQuery = (
  sql: string,
  params?: unknown[],
) => Promise<Array<Record<string, unknown>>>;

export interface KeyLookup {
  hasKey(keyId: string): Promise<boolean>;
  getMetadata(keyId: string): Promise<unknown>;
}

export interface OnlineDeps {
  /** The database, or undefined when no database is configured. */
  readonly query?: DatabaseQuery;
  /** The KMS signer, or undefined when KEY_PROVIDER is not aws-kms. */
  readonly kms?: () => Promise<KeyLookup>;
  readonly defaultKeyId: string;
}

type Env = Readonly<Record<string, string | undefined>>;

/** Tables the storage code reads and writes. Each is referenced by the source under packages/*. */
const REQUIRED_TABLES = [
  "consumed_nonces",
  "consumed_approval_nonces",
  "executions",
  "caller_audit_events",
] as const;

/** The same rule as executionIntentsEnforced() in packages/api/src/bootstrap/createExecutionIntents.ts. */
export function executionIntentsEnforced(env: Env): boolean {
  const relaxed = env.NODE_ENV === "test" || env.NODE_ENV === "development";
  return !(relaxed && env.EXECUTION_INTENTS_CHECK !== "true");
}

export async function runOnlineChecks(
  env: Env,
  deps: OnlineDeps,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  await checkDatabase(env, deps, checks);
  await checkKms(env, deps, checks);
  return checks;
}

async function checkDatabase(
  env: Env,
  deps: OnlineDeps,
  checks: DoctorCheck[],
): Promise<void> {
  const storage = env.PARMANA_STORAGE ?? "memory";
  if (storage === "memory") {
    checks.push({
      name: "database",
      level: "pass",
      message: "memory storage: no database to check",
    });
    return;
  }
  if (deps.query === undefined) {
    checks.push({
      name: "database",
      level: "warn",
      message: "not checked: DATABASE_URL is not set",
      fix: "Set DATABASE_URL, then run doctor with --online again",
    });
    return;
  }

  try {
    await deps.query("SELECT 1");
  } catch (err) {
    checks.push({
      name: "database",
      level: "fail",
      message: `cannot query the database (error ${errorCode(err)})`,
      fix: "Check DATABASE_URL, that the database accepts connections from this machine, and its TLS settings. The connection string is not printed",
    });
    return;
  }
  checks.push({
    name: "database",
    level: "pass",
    message: "reachable (SELECT 1 succeeded)",
  });

  const tables = [...REQUIRED_TABLES];
  if (executionIntentsEnforced(env)) {
    tables.push("execution_intents");
  }

  try {
    const missing: string[] = [];
    for (const table of tables) {
      // Unqualified, so the connection's search_path (PARMANA_DB_SCHEMA) applies, as it does in /ready.
      const rows = await deps.query(
        "SELECT to_regclass($1) IS NOT NULL AS present",
        [table],
      );
      if (rows[0]?.present !== true) missing.push(table);
    }
    if (missing.length > 0) {
      checks.push({
        name: "database tables",
        level: "fail",
        message: `missing tables: ${missing.join(", ")}`,
        fix: "Apply the migrations in supabase/migrations to this database, then run doctor with --online again",
      });
    } else {
      checks.push({
        name: "database tables",
        level: "pass",
        message: `all ${tables.length} required tables exist`,
      });
    }
  } catch (err) {
    checks.push({
      name: "database tables",
      level: "fail",
      message: `cannot read the table list (error ${errorCode(err)})`,
      fix: "Check the database user can read the schema",
    });
  }
}

async function checkKms(
  env: Env,
  deps: OnlineDeps,
  checks: DoctorCheck[],
): Promise<void> {
  if (env.KEY_PROVIDER !== "aws-kms") return;
  // The signer loads the whole server configuration first, so it cannot start without these.
  // Without this check, a missing setting is reported as an unreachable KMS.
  const missing = ["PARMANA_POLICY_DIR", "PARMANA_KEY_DIR"].filter(
    (name) => (env[name] ?? "").trim() === "",
  );
  if (missing.length > 0) {
    checks.push({
      name: "KMS key",
      level: "warn",
      message: `not checked: ${missing.join(" and ")} must be set before the KMS signer can start`,
      fix: "Fix the offline checks above, then run doctor with --online again",
    });
    return;
  }
  if (deps.kms === undefined) {
    checks.push({
      name: "KMS key",
      level: "warn",
      message: "not checked: the KMS signer is not available to doctor",
    });
    return;
  }
  try {
    const signer = await deps.kms();
    if (!(await signer.hasKey(deps.defaultKeyId))) {
      checks.push({
        name: "KMS key",
        level: "fail",
        message: `no KMS key named "${deps.defaultKeyId}" is reachable`,
        fix: "Check AWS_REGION, AWS_ROLE_ARN and the key's existence and permissions",
      });
      return;
    }
    await signer.getMetadata(deps.defaultKeyId);
    checks.push({
      name: "KMS key",
      level: "pass",
      message: `KMS key "${deps.defaultKeyId}" is reachable`,
    });
  } catch (err) {
    checks.push({
      name: "KMS key",
      level: "fail",
      message: `cannot reach KMS (error ${errorCode(err)})`,
      fix: "Check AWS_REGION, AWS_ROLE_ARN, and that this machine has AWS credentials for the key",
    });
  }
}

/** The error code only: Node's cause code, or the error's own code. Never the message. */
export function errorCode(err: unknown): string {
  const cause = (err as { cause?: { code?: unknown } }).cause?.code;
  if (typeof cause === "string") return cause;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string") return code;
  // pg reports a TLS refusal with no code, only a message. The message is read, never printed:
  // it can name a host.
  const message = (err as { message?: unknown }).message;
  if (typeof message === "string" && /\bSSL\b/.test(message)) return "SSL";
  const name = (err as { name?: unknown }).name;
  return typeof name === "string" ? name : "unknown";
}
