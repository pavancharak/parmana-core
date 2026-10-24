import type { ExecutionSystem } from "@parmana/execution-system";
import type { ReleaseGate } from "@parmana/execution-gateway";

import { createExecutionGateway } from "./createExecutionGateway.js";

/**
 * Creates the execution system used by the API.
 *
 * This is the single architectural entry point for
 * execution-system composition.
 */
export async function createExecutionSystem(
  releaseGate?: ReleaseGate,
): Promise<ExecutionSystem> {
  return createExecutionGateway(releaseGate);
}
