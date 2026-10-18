import { ExecutionRequest } from "./ExecutionRequest.js";

import { ExecutionResult } from "@parmana/shared";

/**
 * Canonical Execution System.
 *
 * Parmana forwards approved execution requests
 * to an Execution System.
 */
export interface ExecutionSystem {
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
}
