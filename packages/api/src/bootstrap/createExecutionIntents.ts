import type { ExecutionIntentRepository } from "@parmana/shared";

import { executionIntentRepository } from "../repositories.js";

import { localModeEnabled } from "./localMode.js";

/**
 * Whether Execution Intents (ADR-0012) are enforced for this process.
 *
 * Enforced everywhere except local mode (localMode.ts: PARMANA_LOCAL_MODE=true
 * under NODE_ENV "test" or "development"). In local mode they are off unless
 * EXECUTION_INTENTS_CHECK is set to "true". NODE_ENV alone never turns them off.
 *
 * Read from the environment on every call, so GET /ready reports the state the
 * process is really in.
 */
export function executionIntentsEnforced(): boolean {
  if (!localModeEnabled()) {
    return true;
  }

  return process.env.EXECUTION_INTENTS_CHECK === "true";
}

export function createExecutionIntents():
  ExecutionIntentRepository | undefined {
  return executionIntentsEnforced() ? executionIntentRepository : undefined;
}
