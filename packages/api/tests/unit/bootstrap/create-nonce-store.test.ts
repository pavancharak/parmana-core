import { afterEach, describe, expect, it } from "vitest";

import { MemoryNonceStore } from "@parmana/envelope-verifier";
import { PostgresNonceStore } from "@parmana/storage";

import { createNonceStore } from "../../../src/bootstrap/createNonceStore.js";

const ENV_KEYS = ["NODE_ENV", "DATABASE_URL"] as const;

describe("createNonceStore", () => {
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

  it("returns MemoryNonceStore when NODE_ENV=test, regardless of DATABASE_URL configuration", () => {
    process.env.NODE_ENV = "test";
    delete process.env.DATABASE_URL;

    expect(createNonceStore()).toBeInstanceOf(MemoryNonceStore);
  });

  it("(G-13) fails closed with a named, actionable error when NODE_ENV is not test and DATABASE_URL is not configured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;

    expect(() => createNonceStore()).toThrow(/DATABASE_URL/);
    expect(() => createNonceStore()).toThrow(/NonceStore/);
    expect(() => createNonceStore()).toThrow(/G-13/);
  });

  it("never silently falls back to MemoryNonceStore in production wiring when DATABASE_URL is unconfigured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;

    let result: unknown;
    try {
      result = createNonceStore();
    } catch {
      // expected
    }

    expect(result).toBeUndefined();
  });

  it("returns PostgresNonceStore when NODE_ENV is not test and DATABASE_URL is configured", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL =
      "postgresql://user:pass@example.supabase.co:5432/postgres";

    expect(createNonceStore()).toBeInstanceOf(PostgresNonceStore);
  });
});

describe("createNonceStore: NODE_ENV alone does not select memory (Gap C)", () => {
  const original = Object.fromEntries(
    ["NODE_ENV", "DATABASE_URL", "PARMANA_LOCAL_MODE"].map((key) => [
      key,
      process.env[key],
    ]),
  );

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("refuses to fall back to memory under NODE_ENV=test without local mode", () => {
    process.env.NODE_ENV = "test";
    delete process.env.PARMANA_LOCAL_MODE;
    delete process.env.DATABASE_URL;

    expect(() => createNonceStore()).toThrow(/DATABASE_URL/);
  });

  it("uses memory only when local mode is on under NODE_ENV=test", () => {
    process.env.NODE_ENV = "test";
    process.env.PARMANA_LOCAL_MODE = "true";
    delete process.env.DATABASE_URL;

    expect(createNonceStore()).toBeInstanceOf(MemoryNonceStore);
  });
});
