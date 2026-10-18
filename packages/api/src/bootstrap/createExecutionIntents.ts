import type { ExecutionIntentRepository } from "@parmana/shared";

import { executionIntentRepository } from "../repositories.js";

/**
 * Whether Execution Intents (ADR-0012) are enforced for this process.
 *
 * Enforced everywhere except NODE_ENV "test" and "development", the same rule
 * as the signing readiness check. In those two environments they are off unless
 * EXECUTION_INTENTS_CHECK is set to "true", so existing local workflows and
 * unit tests keep their behavior. In production, and in any other environment,
 * there is no switch to turn them off.
 *
 * Read from the environment on every call, so GET /ready reports the state the
 * process is really in.
 */
export function executionIntentsEnforced(): boolean {
  const env = process.env.NODE_ENV;
  const relaxed = env === "test" || env === "development";

  return !(relaxed && process.env.EXECUTION_INTENTS_CHECK !== "true");
}

export function createExecutionIntents():
  ExecutionIntentRepository | undefined {
  return executionIntentsEnforced() ? executionIntentRepository : undefined;
}
