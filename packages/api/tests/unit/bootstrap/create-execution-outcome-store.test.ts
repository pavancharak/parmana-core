import { afterEach, describe, expect, it } from "vitest";

import { MemoryExecutionOutcomeStore } from "@parmana/execution-gateway";
import { PostgresExecutionOutcomeStore } from "@parmana/storage";

import { createExecutionOutcomeStore } from "../../../src/bootstrap/createExecutionOutcomeStore.js";

const ENV_KEYS = ["NODE_ENV", "DATABASE_URL", "PARMANA_LOCAL_MODE"] as const;

describe("createExecutionOutcomeStore", () => {
  const original = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it("returns MemoryExecutionOutcomeStore only when local mode is on under NODE_ENV=test", () => {
    process.env.NODE_ENV = "test";
    process.env.PARMANA_LOCAL_MODE = "true";
    delete process.env.DATABASE_URL;

    expect(createExecutionOutcomeStore()).toBeInstanceOf(
      MemoryExecutionOutcomeStore,
    );
  });

  it("does not select memory from NODE_ENV=test alone: refuses without local mode or DATABASE_URL", () => {
    process.env.NODE_ENV = "test";
    delete process.env.PARMANA_LOCAL_MODE;
    delete process.env.DATABASE_URL;

    expect(() => createExecutionOutcomeStore()).toThrow(/DATABASE_URL/);
    expect(() => createExecutionOutcomeStore()).toThrow(/ExecutionOutcomeStore/);
  });

  it("never falls back to memory in production when DATABASE_URL is unconfigured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.PARMANA_LOCAL_MODE;
    delete process.env.DATABASE_URL;

    let result: unknown;
    try {
      result = createExecutionOutcomeStore();
    } catch {
      // expected: fails closed
    }

    expect(result).toBeUndefined();
  });

  it("ignores PARMANA_LOCAL_MODE outside test and development, and uses Postgres", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_LOCAL_MODE = "true";
    process.env.DATABASE_URL =
      "postgresql://user:pass@example.supabase.co:5432/postgres";

    expect(createExecutionOutcomeStore()).toBeInstanceOf(
      PostgresExecutionOutcomeStore,
    );
  });

  it("returns PostgresExecutionOutcomeStore in production when DATABASE_URL is configured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.PARMANA_LOCAL_MODE;
    process.env.DATABASE_URL =
      "postgresql://user:pass@example.supabase.co:5432/postgres";

    expect(createExecutionOutcomeStore()).toBeInstanceOf(
      PostgresExecutionOutcomeStore,
    );
  });
});
