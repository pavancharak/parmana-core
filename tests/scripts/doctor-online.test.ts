import { describe, expect, it } from "vitest";

import {
  errorCode,
  executionIntentsEnforced,
  runOnlineChecks,
  type DatabaseQuery,
  type OnlineDeps,
} from "../../scripts/doctor-online.js";

const ALL_TABLES = [
  "consumed_nonces",
  "consumed_approval_nonces",
  "executions",
  "caller_audit_events",
  "execution_intents",
];

/** A database where every required table exists. Records the SQL it was asked to run. */
function healthyDatabase(
  seen: string[] = [],
  missing: string[] = [],
): DatabaseQuery {
  return async (sql, params) => {
    seen.push(sql);
    if (sql === "SELECT 1") return [{ "?column?": 1 }];
    if (sql.startsWith("SELECT to_regclass")) {
      const table = String(params?.[0]);
      return [
        { present: !missing.includes(table) && ALL_TABLES.includes(table) },
      ];
    }
    throw new Error(`unexpected query: ${sql}`);
  };
}

function deps(overrides: Partial<OnlineDeps> = {}): OnlineDeps {
  return {
    query: healthyDatabase(),
    defaultKeyId: "default",
    ...overrides,
  };
}

function find(
  checks: { name: string; level: string; message: string }[],
  name: string,
) {
  const found = checks.find((item) => item.name === name);
  if (found === undefined) throw new Error(`no check named ${name}`);
  return found;
}

const PRODUCTION_ENV = {
  NODE_ENV: "production",
  PARMANA_STORAGE: "postgres",
  DATABASE_URL: "postgresql://u:p@db/x?sslmode=require",
};

describe("online checks, database", () => {
  it("passes memory storage without touching a database", async () => {
    const checks = await runOnlineChecks(
      { PARMANA_STORAGE: "memory" },
      deps({ query: undefined }),
    );
    expect(find(checks, "database").level).toBe("pass");
  });

  it("warns when postgres storage has no database to check", async () => {
    const checks = await runOnlineChecks(
      { ...PRODUCTION_ENV },
      deps({ query: undefined }),
    );
    expect(find(checks, "database").level).toBe("warn");
  });

  it("fails an unreachable database, and reports only the error code", async () => {
    const secret = "super-secret-host-and-password";
    const failing: DatabaseQuery = async () => {
      throw Object.assign(
        new Error(`password authentication failed for ${secret}`),
        { code: "28P01" },
      );
    };
    const checks = await runOnlineChecks(
      { ...PRODUCTION_ENV },
      deps({ query: failing }),
    );
    const result = find(checks, "database");
    expect(result.level).toBe("fail");
    expect(result.message).toContain("28P01");
    expect(JSON.stringify(checks)).not.toContain(secret);
  });

  it("passes when every required table exists", async () => {
    const checks = await runOnlineChecks({ ...PRODUCTION_ENV }, deps());
    expect(find(checks, "database tables").level).toBe("pass");
  });

  it("fails and names the missing tables, with the migration fix", async () => {
    const checks = await runOnlineChecks(
      { ...PRODUCTION_ENV },
      deps({
        query: healthyDatabase([], ["executions", "caller_audit_events"]),
      }),
    );
    const result = find(checks, "database tables");
    expect(result.level).toBe("fail");
    expect(result.message).toContain("executions");
    expect(result.message).toContain("caller_audit_events");
  });

  it("checks the execution_intents table in production, and not under the relaxed development rule", async () => {
    const seen: string[] = [];
    await runOnlineChecks(
      { ...PRODUCTION_ENV },
      deps({ query: healthyDatabase(seen) }),
    );
    expect(seen.some((sql) => sql.includes("to_regclass"))).toBe(true);
    const relaxed: string[] = [];
    const checks = await runOnlineChecks(
      {
        PARMANA_STORAGE: "postgres",
        DATABASE_URL: "postgresql://x",
        NODE_ENV: "development",
      },
      deps({ query: healthyDatabase(relaxed) }),
    );
    expect(find(checks, "database tables").message).toContain(
      "4 required tables",
    );
  });

  it("uses the same rule as the server for execution intents", () => {
    expect(executionIntentsEnforced({ NODE_ENV: "production" })).toBe(true);
    expect(executionIntentsEnforced({ NODE_ENV: "development" })).toBe(false);
    expect(
      executionIntentsEnforced({
        NODE_ENV: "development",
        EXECUTION_INTENTS_CHECK: "true",
      }),
    ).toBe(true);
    expect(executionIntentsEnforced({ NODE_ENV: "test" })).toBe(false);
  });
});

describe("online checks, KMS", () => {
  const kmsEnv = {
    ...PRODUCTION_ENV,
    KEY_PROVIDER: "aws-kms",
    AWS_REGION: "ap-south-1",
    PARMANA_POLICY_DIR: "/policies",
    PARMANA_KEY_DIR: "/keys",
  };

  it("passes when the default key exists and its metadata reads", async () => {
    const checks = await runOnlineChecks(
      kmsEnv,
      deps({
        kms: async () => ({
          hasKey: async () => true,
          getMetadata: async () => ({}),
        }),
      }),
    );
    expect(find(checks, "KMS key").level).toBe("pass");
  });

  it("fails when the default key is not reachable", async () => {
    const checks = await runOnlineChecks(
      kmsEnv,
      deps({
        kms: async () => ({
          hasKey: async () => false,
          getMetadata: async () => ({}),
        }),
      }),
    );
    expect(find(checks, "KMS key").level).toBe("fail");
  });

  it("fails on a KMS error, reporting the code and not the ARN or message", async () => {
    const arn = "arn:aws:iam::123456789012:role/parmana-secret-role";
    const checks = await runOnlineChecks(
      kmsEnv,
      deps({
        kms: async () => {
          throw Object.assign(new Error(`not allowed to assume ${arn}`), {
            name: "AccessDeniedException",
          });
        },
      }),
    );
    const result = find(checks, "KMS key");
    expect(result.level).toBe("fail");
    expect(result.message).toContain("AccessDeniedException");
    expect(JSON.stringify(checks)).not.toContain(arn);
  });

  it("does not try KMS when the settings the signer needs are missing, and says so", async () => {
    let called = false;
    const checks = await runOnlineChecks(
      { ...kmsEnv, PARMANA_POLICY_DIR: undefined },
      deps({
        kms: async () => {
          called = true;
          throw new Error("unreachable");
        },
      }),
    );
    expect(called).toBe(false);
    const result = find(checks, "KMS key");
    expect(result.level).toBe("warn");
    expect(result.message).toContain("PARMANA_POLICY_DIR");
  });

  it("does not look up KMS when the provider is local", async () => {
    let called = false;
    const checks = await runOnlineChecks(
      { ...PRODUCTION_ENV, KEY_PROVIDER: "local" },
      deps({
        kms: async () => {
          called = true;
          throw new Error("no");
        },
      }),
    );
    expect(called).toBe(false);
    expect(checks.some((item) => item.name === "KMS key")).toBe(false);
  });
});

describe("errorCode", () => {
  it("prefers the cause code, then the error code, then the name", () => {
    expect(errorCode({ cause: { code: "ECONNREFUSED" }, code: "X" })).toBe(
      "ECONNREFUSED",
    );
    expect(errorCode({ code: "28P01" })).toBe("28P01");
    expect(errorCode(new RangeError("x"))).toBe("RangeError");
    expect(errorCode("not an error")).toBe("unknown");
  });
});

describe("errorCode, TLS refusals", () => {
  it("classifies a TLS refusal, which pg reports with a message and no code, without printing the message", () => {
    const host = "db.internal.example";
    expect(
      errorCode(
        new Error(`The server at ${host} does not support SSL connections`),
      ),
    ).toBe("SSL");
  });
});
