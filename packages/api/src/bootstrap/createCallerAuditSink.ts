import { PostgresPoolFactory } from "@parmana/storage";

import { InMemoryCallerAuditSink } from "../auth/InMemoryCallerAuditSink.js";
import { SupabaseCallerAuditSink } from "../auth/SupabaseCallerAuditSink.js";
import type { CallerAuditSink } from "../auth/CallerAuditSink.js";

import { assertDatabaseUrlConfigured } from "./assertDatabaseUrlConfigured.js";

/**
 * Creates the CallerAuditSink used by the caller-auth middleware.
 *
 * Test wiring (NODE_ENV=test): InMemoryCallerAuditSink — mirrors
 * createNonceStore.ts's own production/test split for the same reason.
 *
 * Production: SupabaseCallerAuditSink, a durable audit trail. Closes
 * G-13 (docs/VERIFICATION-GAPS.md): caller-authentication events no
 * longer reset on process restart. Fails closed at startup if
 * DATABASE_URL is not configured — never silently falls back to an
 * in-memory sink.
 *
 * Wired to PostgresPoolFactory (DATABASE_URL), not a supabase-js/
 * PostgREST client (SUPABASE_URL) — see SupabaseCallerAuditSink for
 * why (originally a workaround for PostgREST schema-cache issue
 * SU-437429). No longer a narrow, easily-reverted workaround: this
 * same pattern is now the storage layer's deliberate architecture
 * across most Supabase-backed tables (docs/CLAIMS.md 3.11's own
 * update), and the supabase-js-based SupabaseClientFactory this
 * comment used to name as the revert target was deleted 2026-09-09
 * (docs/VERIFICATION-GAPS.md G-34) after confirming it had zero
 * remaining call sites.
 */
export function createCallerAuditSink(): CallerAuditSink {
  if (process.env.NODE_ENV === "test") {
    return new InMemoryCallerAuditSink();
  }

  assertDatabaseUrlConfigured("CallerAuditSink");

  return new SupabaseCallerAuditSink(PostgresPoolFactory.create());
}
