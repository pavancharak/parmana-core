import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PolicyEngine } from "../../src/PolicyEngine.js";
import { PolicyOutcome } from "../../src/types/PolicyOutcome.js";
import type { Policy } from "../../src/types/Policy.js";

/**
 * github-pr-comment 1.0.0: one comment on a pull request needs a signed human
 * approval. The approval covers the exact text and the exact target, so the
 * policy's signal is true only when the approval matches both.
 */

const policy = JSON.parse(
  readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../../../policies/github-pr-comment/1.0.0/policy.json",
    ),
    "utf8",
  ),
) as Policy;

const engine = new PolicyEngine();

describe("github-pr-comment 1.0.0", () => {
  it("approves a comment when a signed human approval is present", () => {
    const decision = engine.evaluate(policy, { humanApproved: true });
    expect(decision.outcome).toBe(PolicyOutcome.APPROVE);
  });

  it("rejects a comment without a signed human approval", () => {
    const decision = engine.evaluate(policy, { humanApproved: false });
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
  });

  it("declares the approval bound to the comment text and the target", () => {
    expect(policy.approvalSignals?.humanApproved).toEqual({
      value: "parameters.body",
      resourceId: "target",
    });
  });
});
