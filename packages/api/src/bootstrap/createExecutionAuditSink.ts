import {
  MemoryExecutionAuditSink,
  type ExecutionAuditSink,
} from "@parmana/execution-control";

import {
  PostgresPoolFactory,
  SupabaseExecutionAuditSink,
} from "@parmana/storage";

import { assertDatabaseUrlConfigured } from "./assertDatabaseUrlConfigured.js";

/**
 * Creates the Execution Audit sink.
 *
 * Test wiring (NODE_ENV=test): MemoryExecutionAuditSink — mirrors
 * createCallerAuditSink.ts's own production/test split for the same
 * reason.
 *
 * Production: SupabaseExecutionAuditSink, a durable, signed,
 * per-authorization-chained audit trail. Closes GAP-1 (GAPS.md
 * 2026-09-14): session.created/execution.completed/execution.rejected
 * events no longer reset on process restart, and are queryable
 * (SupabaseExecutionAuditSink.query()) instead of living only in this
 * process's memory. Fails closed at startup if DATABASE_URL is not
 * configured — never silently falls back to an in-memory sink.
 *
 * Wired to PostgresPoolFactory (DATABASE_URL), not a supabase-js/
 * PostgREST client (SUPABASE_URL) — same convention as every other
 * Supabase-backed audit sink in this codebase (see
 * SupabaseCallerAuditSink's own comment for why).
 */
export function createExecutionAuditSink(): ExecutionAuditSink {
  if (process.env.NODE_ENV === "test") {
    return new MemoryExecutionAuditSink();
  }

  assertDatabaseUrlConfigured("ExecutionAuditSink");

  return new SupabaseExecutionAuditSink(PostgresPoolFactory.create());
}
