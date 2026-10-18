import type {
  ExecutionRequest,
  ExecutionResult,
  ExecutionSystem,
} from "@parmana/execution-system";

/**
 * Execution System that always fails.
 *
 * Used by integration tests to verify the
 * runtime failure path.
 */
export class FailingExecutionSystem implements ExecutionSystem {
  public async execute(_request: ExecutionRequest): Promise<ExecutionResult> {
    throw new Error("Simulated execution failure.");
  }
}
