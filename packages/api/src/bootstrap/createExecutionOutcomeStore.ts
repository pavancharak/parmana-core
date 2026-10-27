import type { ExecutionOutcomeStore } from "@parmana/shared";
import { MemoryExecutionOutcomeStore } from "@parmana/execution-gateway";
import {
  PostgresPoolFactory,
  SupabaseExecutionOutcomeStore,
} from "@parmana/storage";

import { assertDatabaseUrlConfigured } from "./assertDatabaseUrlConfigured.js";

/**
 * Creates the ExecutionOutcomeStore used by the ExecutionGateway (G-125,
 * docs/VERIFICATION-GAPS.md). It records what each authorization's execution
 * returned, so a retry after a lost response can recover the result instead
 * of being refused with no information.
 *
 * Test wiring (NODE_ENV=test): MemoryExecutionOutcomeStore, the same split
 * createNonceStore.ts uses.
 *
 * Production: SupabaseExecutionOutcomeStore. Fails closed at startup without
 * DATABASE_URL, never falls back to memory, since a silent fallback would
 * bring back the unknown-outcome gap with no signal.
 */
export function createExecutionOutcomeStore(): ExecutionOutcomeStore {
  if (process.env.NODE_ENV === "test") {
    return new MemoryExecutionOutcomeStore();
  }

  assertDatabaseUrlConfigured("ExecutionOutcomeStore");

  return new SupabaseExecutionOutcomeStore(PostgresPoolFactory.create());
}
