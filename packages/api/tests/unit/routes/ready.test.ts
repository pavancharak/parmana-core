import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PostgresPoolFactory } from "@parmana/storage";

import { createApplication } from "../../../src/application.js";
import { createApp } from "../../../src/app.js";
import { createExecutionSystem } from "../../../src/bootstrap/createExecutionSystem.js";

const ENV_KEYS = [
  "NODE_ENV",
  "PARMANA_STORAGE",
  "DATABASE_URL",
  "EXECUTION_INTENTS_CHECK",
] as const;

async function buildApp(
  callerAuth: Parameters<typeof createApp>[1]["callerAuth"] = "disabled",
) {
  const executionSystem = await createExecutionSystem();
  const application = createApplication(executionSystem);
  return createApp(application, { callerAuth });
}

describe("GET /ready", () => {
  const original = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  afterEach(() => {
    vi.restoreAllMocks();

    for (const key of ENV_KEYS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it("reports READY without touching Supabase when NODE_ENV=test", async () => {
    const response = await request(await buildApp()).get("/ready");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("READY");
    expect(response.body.storage).toBe("not-supabase-backed");
  });

  it("surfaces authDisabled:true and a warning when callerAuth is disabled", async () => {
    const response = await request(await buildApp("disabled")).get("/ready");

    expect(response.body.authDisabled).toBe(true);
    expect(typeof response.body.warning).toBe("string");
  });

  it("surfaces authDisabled:false when caller auth is enabled", async () => {
    const app = await buildApp({
      authenticator: { authenticate: () => undefined },
      auditSink: { record: async () => {} },
    });

    const response = await request(app).get("/ready");

    expect(response.body.authDisabled).toBe(false);
    expect(response.body.warning).toBeUndefined();
  });

  it("reports READY without touching Supabase when storage is memory-backed outside test", async () => {
    // Built under NODE_ENV=test (see the next test's comment for why:
    // createNonceStore.ts's own eager check always requires DATABASE_URL
    // outside NODE_ENV=test, by design, independent of PARMANA_STORAGE
    // -- so flipping env before buildApp() would throw for a reason
    // unrelated to what this test exercises).
    const app = await buildApp();

    process.env.NODE_ENV = "production";
    process.env.PARMANA_STORAGE = "memory";

    const response = await request(app).get("/ready");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("READY");
  });

  it("reports NOT_READY (503) with a reason when Supabase-backed and the connection fails", async () => {
    // Built under NODE_ENV=test (so app construction's own eager
    // assertStorageConfigured/createNonceStore checks don't themselves
    // throw on the bad DATABASE_URL below) -- the route handler
    // reads process.env fresh per request, independent of how the app
    // was constructed, so flipping env only around the request itself
    // still exercises the live-storage branch faithfully.
    const app = await buildApp();

    process.env.NODE_ENV = "production";
    process.env.PARMANA_STORAGE = "supabase";
    process.env.DATABASE_URL =
      "postgresql://unreachable:unreachable@127.0.0.1:1/postgres";

    const response = await request(app).get("/ready");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("NOT_READY");
    expect(typeof response.body.reason).toBe("string");
  });

  it("(G-57) probes Postgres when PARMANA_STORAGE=postgres, the same as supabase", async () => {
    const app = await buildApp();

    process.env.NODE_ENV = "production";
    process.env.PARMANA_STORAGE = "postgres";
    process.env.DATABASE_URL =
      "postgresql://unreachable:unreachable@127.0.0.1:1/postgres";

    const response = await request(app).get("/ready");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("NOT_READY");
  });

  describe("Execution Intents table (ADR-0012)", () => {
    function fakePool(intentsTable: string | null) {
      const queries: string[] = [];

      const pool = {
        query: async (sql: string) => {
          queries.push(sql);

          return sql.includes("to_regclass")
            ? { rows: [{ execution_intents: intentsTable }] }
            : { rows: [{ "?column?": 1 }] };
        },
      };

      vi.spyOn(PostgresPoolFactory, "create").mockReturnValue(
        pool as unknown as ReturnType<typeof PostgresPoolFactory.create>,
      );

      return queries;
    }

    async function requestReady() {
      const app = await buildApp();

      process.env.NODE_ENV = "production";
      process.env.PARMANA_STORAGE = "supabase";

      return request(app).get("/ready");
    }

    it("reports NOT_READY with the exact remedy when intents are enforced and the table is missing", async () => {
      fakePool(null);

      const response = await requestReady();

      expect(response.status).toBe(503);
      expect(response.body.status).toBe("NOT_READY");
      expect(response.body.reason).toContain("execution_intents");
      expect(response.body.reason).toContain(
        "20260921120000_add_execution_intents.sql",
      );
    });

    it("reports READY when intents are enforced and the table exists", async () => {
      fakePool("execution_intents");

      const response = await requestReady();

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("READY");
    });

    it("does not look for the table when intents are relaxed (development without the switch)", async () => {
      const queries = fakePool(null);
      const app = await buildApp();

      process.env.NODE_ENV = "development";
      process.env.PARMANA_STORAGE = "supabase";
      delete process.env.EXECUTION_INTENTS_CHECK;

      const response = await request(app).get("/ready");

      expect(response.status).toBe(200);
      expect(queries.some((sql) => sql.includes("to_regclass"))).toBe(false);
    });

    it("looks for the table in development when EXECUTION_INTENTS_CHECK is true", async () => {
      fakePool(null);
      const app = await buildApp();

      process.env.NODE_ENV = "development";
      process.env.PARMANA_STORAGE = "supabase";
      process.env.EXECUTION_INTENTS_CHECK = "true";

      const response = await request(app).get("/ready");

      expect(response.status).toBe(503);
    });
  });
});
