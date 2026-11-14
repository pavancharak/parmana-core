import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PolicyEngine } from "../../src/PolicyEngine.js";
import { PolicyValidator } from "../../src/PolicyValidator.js";
import { PolicyOutcome } from "../../src/types/PolicyOutcome.js";
import type { Policy } from "../../src/types/Policy.js";

/**
 * github-pr-comment 1.0.0: one comment on a pull request needs two signed
 * approvals from trusted people. One covers the exact pull request (the
 * target). The other covers the exact comment text (the body). Each
 * approval is checked by the approval verifier; the policy decides on the
 * two signals only.
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
const validator = new PolicyValidator();

describe("github-pr-comment 1.0.0", () => {
  it("approves a comment when both the target and the body are approved", () => {
    const decision = engine.evaluate(policy, {
      targetApproved: true,
      bodyApproved: true,
    });
    expect(decision.outcome).toBe(PolicyOutcome.APPROVE);
  });

  it("rejects a comment when only the target is approved", () => {
    const decision = engine.evaluate(policy, {
      targetApproved: true,
      bodyApproved: false,
    });
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
  });

  it("rejects a comment when only the body is approved", () => {
    const decision = engine.evaluate(policy, {
      targetApproved: false,
      bodyApproved: true,
    });
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
  });

  it("rejects a comment when neither approval is present", () => {
    const decision = engine.evaluate(policy, {
      targetApproved: false,
      bodyApproved: false,
    });
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
  });

  it("binds the target approval to the target, and the body approval to the body text", () => {
    expect(policy.approvalSignals?.targetApproved).toEqual({
      resourceId: "target",
      artifact: "targetApprovalArtifact",
    });
    expect(policy.approvalSignals?.bodyApproved).toEqual({
      resourceId: "parameters.body",
      artifact: "bodyApprovalArtifact",
    });
  });

  it("passes the policy validator, with both approvals covered by rules", () => {
    expect(() => validator.validate(policy)).not.toThrow();
    expect(validator.findUncoveredFacts(policy)).toEqual([]);
  });
});
