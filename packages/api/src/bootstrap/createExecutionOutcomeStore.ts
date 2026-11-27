import type { ExecutionOutcomeStore } from "@parmana/shared";
import { MemoryExecutionOutcomeStore } from "@parmana/execution-gateway";
import {
  PostgresPoolFactory,
  PostgresExecutionOutcomeStore,
} from "@parmana/storage";

import { assertDatabaseUrlConfigured } from "./assertDatabaseUrlConfigured.js";
import { localModeEnabled } from "./localMode.js";

/**
 * Creates the ExecutionOutcomeStore used by the ExecutionGateway (G-125,
 * docs/internal/VERIFICATION-GAPS.md). It records what each authorization's execution
 * returned, so a retry after a lost response can recover the result instead
 * of being refused with no information.
 *
 * Local mode (PARMANA_LOCAL_MODE=true under NODE_ENV test or development,
 * see localMode.ts): MemoryExecutionOutcomeStore. NODE_ENV alone does not
 * select memory, the same rule createNonceStore.ts follows.
 *
 * Production: PostgresExecutionOutcomeStore. Fails closed at startup without
 * DATABASE_URL, never falls back to memory, since a silent fallback would
 * bring back the unknown-outcome gap with no signal.
 */
export function createExecutionOutcomeStore(): ExecutionOutcomeStore {
  if (localModeEnabled()) {
    return new MemoryExecutionOutcomeStore();
  }

  assertDatabaseUrlConfigured("ExecutionOutcomeStore");

  return new PostgresExecutionOutcomeStore(PostgresPoolFactory.create());
}
