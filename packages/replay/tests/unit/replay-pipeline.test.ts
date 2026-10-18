import { describe, expect, it } from "vitest";

import { ReplayPipeline } from "../../src/engine/ReplayPipeline.js";

describe("ReplayPipeline", () => {
  it("builds a plan containing the given execution ids in order", () => {
    const pipeline = new ReplayPipeline();

    const plan = pipeline.buildPlan(["exec-1", "exec-2", "exec-3"]);

    expect(plan.executionIds).toEqual(["exec-1", "exec-2", "exec-3"]);
  });

  it("returns a defensive copy, not the original array reference", () => {
    const pipeline = new ReplayPipeline();
    const input = ["exec-1"];

    const plan = pipeline.buildPlan(input);

    expect(plan.executionIds).not.toBe(input);
    expect(plan.executionIds).toEqual(input);
  });

  it("builds an empty plan for no execution ids", () => {
    const pipeline = new ReplayPipeline();

    expect(pipeline.buildPlan([]).executionIds).toEqual([]);
  });
});
