import { afterEach, describe, expect, it } from "vitest";

import { SupabaseCallerAuditSink } from "../../../src/auth/SupabaseCallerAuditSink.js";
import { InMemoryCallerAuditSink } from "../../../src/auth/InMemoryCallerAuditSink.js";

import { createCallerAuditSink } from "../../../src/bootstrap/createCallerAuditSink.js";

const ENV_KEYS = [
  "NODE_ENV",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "DATABASE_URL",
] as const;

describe("createCallerAuditSink", () => {
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

  it("returns InMemoryCallerAuditSink when NODE_ENV=test, regardless of DATABASE_URL configuration", () => {
    process.env.NODE_ENV = "test";
    delete process.env.DATABASE_URL;

    expect(createCallerAuditSink()).toBeInstanceOf(InMemoryCallerAuditSink);
  });

  it("(G-13) fails closed with a named, actionable error when NODE_ENV is not test and DATABASE_URL is not configured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;

    expect(() => createCallerAuditSink()).toThrow(/DATABASE_URL/);
    expect(() => createCallerAuditSink()).toThrow(/CallerAuditSink/);
    expect(() => createCallerAuditSink()).toThrow(/G-13/);
  });

  it("never silently falls back to InMemoryCallerAuditSink in production wiring when DATABASE_URL is unconfigured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;

    let result: unknown;
    try {
      result = createCallerAuditSink();
    } catch {
      // expected
    }

    expect(result).toBeUndefined();
  });

  it("returns SupabaseCallerAuditSink when NODE_ENV is not test and DATABASE_URL is configured", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL =
      "postgresql://user:pass@example.supabase.co:5432/postgres";

    expect(createCallerAuditSink()).toBeInstanceOf(SupabaseCallerAuditSink);
  });
});
