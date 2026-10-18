import { afterEach, describe, expect, it } from "vitest";

import { MemoryExecutionAuditSink } from "@parmana/execution-control";
import { SupabaseExecutionAuditSink } from "@parmana/storage";

import { createExecutionAuditSink } from "../../../src/bootstrap/createExecutionAuditSink.js";

const ENV_KEYS = ["NODE_ENV", "DATABASE_URL"] as const;

describe("createExecutionAuditSink", () => {
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

  it("returns MemoryExecutionAuditSink when NODE_ENV=test, regardless of DATABASE_URL configuration", () => {
    process.env.NODE_ENV = "test";
    delete process.env.DATABASE_URL;

    expect(createExecutionAuditSink()).toBeInstanceOf(MemoryExecutionAuditSink);
  });

  it("(GAP-1) fails closed with a named, actionable error when NODE_ENV is not test and DATABASE_URL is not configured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;

    expect(() => createExecutionAuditSink()).toThrow(/DATABASE_URL/);
    expect(() => createExecutionAuditSink()).toThrow(/ExecutionAuditSink/);
  });

  it("never silently falls back to MemoryExecutionAuditSink in production wiring when DATABASE_URL is unconfigured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;

    let result: unknown;
    try {
      result = createExecutionAuditSink();
    } catch {
      // expected
    }

    expect(result).toBeUndefined();
  });

  it("returns SupabaseExecutionAuditSink when NODE_ENV is not test and DATABASE_URL is configured", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL =
      "postgresql://user:pass@example.supabase.co:5432/postgres";

    expect(createExecutionAuditSink()).toBeInstanceOf(
      SupabaseExecutionAuditSink,
    );
  });
});
