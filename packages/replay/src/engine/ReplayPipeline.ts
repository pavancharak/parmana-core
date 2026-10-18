import type { ReplayPlan } from "./ReplayPlan.js";

/**
 * Deterministic replay sequencing engine.
 */
export class ReplayPipeline {
  public buildPlan(executionIds: string[]): ReplayPlan {
    return {
      executionIds: [...executionIds],
    };
  }
}
