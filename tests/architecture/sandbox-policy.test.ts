import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PolicyEngine, PolicyValidator, type Policy } from "@parmana/policy";

/**
 * The public sandbox's policy (deploy/sandbox/policy.json, ADR-0014)
 * is proposed and approved in the sandbox by hand. These checks catch a
 * mistake in it before then: it must pass the server's own validator,
 * and the engine must decide the four cases the playground shows.
 */

const policy = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "deploy", "sandbox", "policy.json"),
    "utf8",
  ),
) as Policy;

const engine = new PolicyEngine();

describe("the sandbox policy", () => {
  it("passes the server's policy validator", () => {
    expect(() => new PolicyValidator().validate(policy)).not.toThrow();
  });

  it("refuses a request with no approval", () => {
    const decision = engine.evaluate(policy, {
      receiptApproved: false,
      note: "hello",
    });

    expect(decision.outcome).toBe("REJECT");
    expect(decision.matchedRuleId).toBe("reject-approval-required");
  });

  it("approves a request with an approval", () => {
    const decision = engine.evaluate(policy, {
      receiptApproved: true,
      note: "hello",
    });

    expect(decision.outcome).toBe("APPROVE");
  });

  it("refuses a note over 200 characters even with an approval", () => {
    const decision = engine.evaluate(policy, {
      receiptApproved: true,
      note: "x".repeat(201),
    });

    expect(decision.outcome).toBe("REJECT");
    expect(decision.matchedRuleId).toBe("reject-long-note");
  });

  it("accepts a note of exactly 200 characters", () => {
    const decision = engine.evaluate(policy, {
      receiptApproved: true,
      note: "x".repeat(200),
    });

    expect(decision.outcome).toBe("APPROVE");
  });

  it("binds the note to the forwarded parameter and the approval to the target", () => {
    expect(policy.boundSignals).toEqual({ note: "parameters.note" });
    expect(policy.approvalSignals).toEqual({
      receiptApproved: { resourceId: "target" },
    });
  });
});
