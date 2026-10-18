import { ExecutionResult } from "@parmana/shared";

import { ExecutionRequest } from "./ExecutionRequest.js";

import { ExecutionSystem } from "./ExecutionSystem.js";

/**
 * Default Execution System.
 *
 * Placeholder implementation used until a real
 * enterprise execution system is configured.
 */
export class DefaultExecutionSystem implements ExecutionSystem {
  public async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    return {
      businessTransactionId: request.businessTransactionId,

      action: request.action,

      target: request.target,

      parameters: request.parameters,

      success: true,

      executedAt: new Date(),

      metadata: {},
    };
  }
}
