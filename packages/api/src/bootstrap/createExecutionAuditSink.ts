import {
  MemoryExecutionAuditSink,
  type ExecutionAuditSink,
} from "@parmana/execution-control";

import { StorageFactory } from "@parmana/storage";

import { assertDatabaseUrlConfigured } from "./assertDatabaseUrlConfigured.js";

/**
 * Creates the Execution Audit sink.
 *
 * Test wiring (NODE_ENV=test): MemoryExecutionAuditSink, as before.
 *
 * Production: the audit sink of the PostgreSQL storage provider. It is a
 * durable, signed, per-authorization-chained trail (GAP-1): events survive
 * restarts and are queryable through PostgresExecutionAuditSink.query().
 *
 * The provider is pinned to "postgres", not read from PARMANA_STORAGE. A
 * process configured with PARMANA_STORAGE=memory must still fail closed
 * here rather than keep its audit trail in memory (ADR-0021, step 3).
 * Fails at startup if DATABASE_URL is not configured.
 */
export function createExecutionAuditSink(): ExecutionAuditSink {
  if (process.env.NODE_ENV === "test") {
    return new MemoryExecutionAuditSink();
  }

  assertDatabaseUrlConfigured("ExecutionAuditSink");

  return StorageFactory.create({ provider: "postgres" }).executionAuditSink;
}
