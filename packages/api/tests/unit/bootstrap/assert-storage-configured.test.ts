import { afterEach, describe, expect, it } from "vitest";

import { assertStorageConfigured } from "../../../src/bootstrap/assertStorageConfigured.js";

const ENV_KEYS = ["NODE_ENV", "PARMANA_STORAGE", "DATABASE_URL"] as const;

describe("assertStorageConfigured", () => {
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

  it("is a no-op when NODE_ENV=test, regardless of storage configuration", () => {
    process.env.NODE_ENV = "test";
    process.env.PARMANA_STORAGE = "supabase";
    delete process.env.DATABASE_URL;

    expect(() => assertStorageConfigured()).not.toThrow();
  });

  it("is a no-op outside test mode when PARMANA_STORAGE=memory", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_STORAGE = "memory";
    delete process.env.DATABASE_URL;

    expect(() => assertStorageConfigured()).not.toThrow();
  });

  it("fails closed with a named, actionable error when PARMANA_STORAGE=supabase and DATABASE_URL is not configured", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_STORAGE = "supabase";
    delete process.env.DATABASE_URL;

    expect(() => assertStorageConfigured()).toThrow(/DATABASE_URL/);
    expect(() => assertStorageConfigured()).toThrow(/Storage/);
  });

  it("does not throw when PARMANA_STORAGE=supabase and DATABASE_URL is configured", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_STORAGE = "supabase";
    process.env.DATABASE_URL =
      "postgresql://user:pass@example.supabase.co:5432/postgres";

    expect(() => assertStorageConfigured()).not.toThrow();
  });

  it("(G-57) fails closed when PARMANA_STORAGE=postgres and DATABASE_URL is not configured", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_STORAGE = "postgres";
    delete process.env.DATABASE_URL;

    expect(() => assertStorageConfigured()).toThrow(/DATABASE_URL/);
  });

  it("(G-57) does not throw when PARMANA_STORAGE=postgres and DATABASE_URL is configured", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_STORAGE = "postgres";
    process.env.DATABASE_URL =
      "postgresql://parmana:parmana@localhost:5432/parmana";

    expect(() => assertStorageConfigured()).not.toThrow();
  });
});
