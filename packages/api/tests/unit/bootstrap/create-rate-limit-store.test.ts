import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PostgresRateLimitStore } from "@parmana/storage";

import { createRateLimitStore } from "../../../src/bootstrap/createRateLimitStore.js";

const ENV_KEYS = ["NODE_ENV", "DATABASE_URL"] as const;

describe("createRateLimitStore", () => {
  const original = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

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

  it("returns undefined (in-process MemoryStore fallback) when NODE_ENV=test", () => {
    process.env.NODE_ENV = "test";
    delete process.env.DATABASE_URL;

    expect(createRateLimitStore("execute:")).toBeUndefined();
  });

  it("returns undefined and warns loudly when not test and DATABASE_URL is unconfigured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;

    const result = createRateLimitStore("execute:");

    expect(result).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "rate_limit_store_not_durable" }),
    );
  });

  it("returns a durable PostgresRateLimitStore when not test and DATABASE_URL is configured", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL =
      "postgresql://user:pass@example.supabase.co:5432/postgres";

    expect(createRateLimitStore("execute:")).toBeInstanceOf(
      PostgresRateLimitStore,
    );
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("returns two independent Store instances for two different prefixes, never the same instance", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL =
      "postgresql://user:pass@example.supabase.co:5432/postgres";

    const executeStore = createRateLimitStore("execute:");
    const healthStore = createRateLimitStore("health:");

    expect(executeStore).toBeInstanceOf(PostgresRateLimitStore);
    expect(healthStore).toBeInstanceOf(PostgresRateLimitStore);
    expect(executeStore).not.toBe(healthStore);
  });
});
