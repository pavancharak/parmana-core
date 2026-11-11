import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ExecutionMode,
  type Execution,
  type ExecutionResult,
} from "@parmana/shared";

import { ExecutionComponent } from "../../src/components/ExecutionComponent.js";
import type { RuntimeContext } from "../../src/context/RuntimeContext.js";

/**
 * Item 3 of the enforcement-path guide: if recording a failed execution throws,
 * the caller must still get the refusal that failed the execution.
 */

const EXECUTION = { executionId: "exec-1" } as unknown as Execution;

const CONTEXT = {
  transaction: { businessTransactionId: "txn-component-1" },
  decision: {},
  authorization: { payload: { authorizationId: "auth-1" } },
} as unknown as RuntimeContext;

function componentWith(options: { refusal: Error; failError?: Error }) {
  const executionService = {
    create: vi.fn(async () => EXECUTION),
    fail: vi.fn(async () => {
      if (options.failError !== undefined) {
        throw options.failError;
      }

      return EXECUTION;
    }),
  };
  const executionSystem = {
    execute: vi.fn(async (): Promise<ExecutionResult> => {
      throw options.refusal;
    }),
  };

  const component = new ExecutionComponent(
    executionService as never,
    { build: () => ({}) } as never,
    executionSystem as never,
    {} as never,
  );

  return { component, executionService };
}

describe("ExecutionComponent when the release is refused", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rethrows the original refusal and marks the execution failed", async () => {
    const refusal = new Error("Not released: connector not registered.");
    const { component, executionService } = componentWith({ refusal });

    await expect(component.execute(CONTEXT)).rejects.toBe(refusal);
    expect(executionService.fail).toHaveBeenCalledTimes(1);
  });

  it("still rethrows the original refusal when recording the failure also throws, and logs the recording error", async () => {
    const refusal = new Error("Not released: connector not registered.");
    const recordError = new Error("database unavailable");
    const logged: unknown[] = [];
    vi.spyOn(console, "error").mockImplementation((entry: unknown) => {
      logged.push(entry);
    });
    const { component } = componentWith({ refusal, failError: recordError });

    await expect(component.execute(CONTEXT)).rejects.toBe(refusal);
    expect(logged).toEqual([
      {
        event: "execution_failure_not_recorded",
        businessTransactionId: "txn-component-1",
        executionId: "exec-1",
        error: "database unavailable",
      },
    ]);
  });
});
