import type { NonceStore } from "@parmana/envelope-verifier";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import {
  PostgresPoolFactory,
  SupabaseApprovalNonceStore,
} from "@parmana/storage";

import { assertDatabaseUrlConfigured } from "./assertDatabaseUrlConfigured.js";

/**
 * Creates the NonceStore used by ApprovalVerifier to enforce that a
 * Signed Approval Artifact is consumed at most once (TD-23 closure,
 * Phase 3C).
 *
 * Deliberately a separate instance/table from createNonceStore.ts's
 * own NonceStore (ExecutionGateway's Authorization-envelope replay
 * protection) -- see SupabaseApprovalNonceStore's own comment for why
 * the two nonce namespaces must not share a table.
 *
 * Test wiring (NODE_ENV=test): MemoryNonceStore -- mirrors
 * createNonceStore.ts's own production/test split exactly.
 *
 * Production: SupabaseApprovalNonceStore, a durable store shared
 * across every process pointed at the same Supabase project. Fails
 * closed at startup if DATABASE_URL is not configured -- never
 * silently falls back to an in-memory store, which would silently
 * narrow Approval Artifact replay protection to a single process's
 * uptime with no signal that it happened, the same reasoning
 * createNonceStore.ts already applies.
 */
export function createApprovalNonceStore(): NonceStore {
  if (process.env.NODE_ENV === "test") {
    return new MemoryNonceStore();
  }

  assertDatabaseUrlConfigured("ApprovalNonceStore");

  return new SupabaseApprovalNonceStore(PostgresPoolFactory.create());
}
