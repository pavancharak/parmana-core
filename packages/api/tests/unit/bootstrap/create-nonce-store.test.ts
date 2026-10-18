import { afterEach, describe, expect, it } from "vitest";

import { MemoryNonceStore } from "@parmana/envelope-verifier";
import { SupabaseNonceStore } from "@parmana/storage";

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

  it("returns SupabaseNonceStore when NODE_ENV is not test and DATABASE_URL is configured", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL =
      "postgresql://user:pass@example.supabase.co:5432/postgres";

    expect(createNonceStore()).toBeInstanceOf(SupabaseNonceStore);
  });
});
