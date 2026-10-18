import { readFileSync } from "node:fs";
import path from "node:path";

import {
  PolicyEngine,
  PolicyOutcome,
  PolicyValidator,
  type Policy,
} from "@parmana/policy";
import { describe, expect, it } from "vitest";

/**
 * Reference policy demonstrating capability-based authorization for
 * Connector SDK connectors (Deliverable: REFERENCE POLICY). Outcomes are
 * strictly "approve" (ALLOW) or "reject" (BLOCK) -- PolicyAction has only
 * those two values (REQUIRE_OVERRIDE, a reserved-but-unused third value,
 * was removed as dead code; see docs/VERIFICATION-GAPS.md G-38).
 */
const policy = JSON.parse(
  readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../../../policies/connector-capability/1.1.0/policy.json",
    ),
    "utf8",
  ),
) as Policy;

describe("connector-capability reference policy", () => {
  const validator = new PolicyValidator();
  const engine = new PolicyEngine();

  it("validates against the locked policy schema", () => {
    expect(() => validator.validate(policy)).not.toThrow();
  });

  it("ALLOWs crm:read", () => {
    const decision = engine.evaluate(policy, {
      humanApproved: true,
      capability: "crm:read",
      paymentAmount: 0,
    });
    expect(decision.outcome).toBe(PolicyOutcome.APPROVE);
    expect(decision.matchedRuleId).toBe("allow-crm-read");
  });

  it("BLOCKs crm:delete", () => {
    const decision = engine.evaluate(policy, {
      humanApproved: true,
      capability: "crm:delete",
      paymentAmount: 0,
    });
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
    expect(decision.matchedRuleId).toBe("block-crm-delete");
  });

  it("ALLOWs payments:refund within the configured threshold", () => {
    const decision = engine.evaluate(policy, {
      humanApproved: true,
      capability: "payments:refund",
      paymentAmount: 5000,
    });
    expect(decision.outcome).toBe(PolicyOutcome.APPROVE);
    expect(decision.matchedRuleId).toBe(
      "allow-payments-refund-within-threshold",
    );
  });

  it("BLOCKs payments:refund above the configured threshold", () => {
    const decision = engine.evaluate(policy, {
      humanApproved: true,
      capability: "payments:refund",
      paymentAmount: 5001,
    });
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
    expect(decision.matchedRuleId).toBe(
      "block-payments-refund-above-threshold",
    );
  });

  it("BLOCKs crm:read without a signed human approval", () => {
    const decision = engine.evaluate(policy, {
      humanApproved: false,
      capability: "crm:read",
      paymentAmount: 0,
    });
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
  });

  it("BLOCKs by default any capability not explicitly authorized", () => {
    const decision = engine.evaluate(policy, {
      humanApproved: true,
      capability: "sap:write",
      paymentAmount: 0,
    });
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
    expect(decision.matchedRuleId).toBe("reject-default");
  });
});
