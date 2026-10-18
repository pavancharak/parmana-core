import type { NonceStore } from "@parmana/envelope-verifier";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import {
  PostgresPoolFactory,
  SupabasePolicyChangeStepUpNonceStore,
} from "@parmana/storage";

import { assertDatabaseUrlConfigured } from "./assertDatabaseUrlConfigured.js";

/**
 * Creates the NonceStore used by PolicyChangeStepUpVerifier to enforce
 * that a signed step-up envelope on POST /policies/pending-changes/:id/
 * approve or .../reject is consumed at most once (Policy Governance,
 * maker-checker, Layer 4).
 *
 * Deliberately a separate instance/table from both createNonceStore.ts
 * (ExecutionGateway's own Authorization-envelope replay protection)
 * and createApprovalNonceStore.ts (Approval Artifact replay
 * protection) -- see SupabasePolicyChangeStepUpNonceStore's own
 * comment for why the three nonce namespaces must not share a table.
 *
 * Test wiring (NODE_ENV=test): MemoryNonceStore -- mirrors
 * createNonceStore.ts/createApprovalNonceStore.ts's own production/
 * test split exactly.
 *
 * Production: SupabasePolicyChangeStepUpNonceStore, a durable store
 * shared across every process pointed at the same Supabase project.
 * Fails closed at startup if DATABASE_URL is not configured -- never
 * silently falls back to an in-memory store, which would silently
 * narrow step-up replay protection to a single process's uptime with
 * no signal that it happened, the same reasoning createNonceStore.ts/
 * createApprovalNonceStore.ts already apply.
 */
export function createPolicyChangeStepUpNonceStore(): NonceStore {
  if (process.env.NODE_ENV === "test") {
    return new MemoryNonceStore();
  }

  assertDatabaseUrlConfigured("PolicyChangeStepUpNonceStore");

  return new SupabasePolicyChangeStepUpNonceStore(PostgresPoolFactory.create());
}
