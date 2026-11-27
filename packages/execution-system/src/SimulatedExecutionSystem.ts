import { ExecutionResult } from "@parmana/shared";

import { ExecutionRequest } from "./ExecutionRequest.js";
import { ExecutionSystem } from "./ExecutionSystem.js";

/**
 * Simulated Execution System. It executes nothing.
 *
 * It returns a successful result for any request, without calling a
 * connector or any real system. Use it only in tests and examples, where
 * the outcome of the execution is not the subject. Never use it as a real
 * execution system: an action it "executes" never happened.
 */
export class SimulatedExecutionSystem implements ExecutionSystem {
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
