import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PolicyEngine } from "../../src/PolicyEngine.js";
import { PolicyValidator } from "../../src/PolicyValidator.js";
import { PolicyOutcome } from "../../src/types/PolicyOutcome.js";
import type { Policy, PolicyCondition } from "../../src/types/Policy.js";
import type { PolicySignals } from "../../src/types/PolicySignals.js";

/**
 * Policies where an agent could otherwise approve its own action by
 * declaring caller facts true (G-73, G-74, G-75). In each, every approve
 * rule requires a fact declared in approvalSignals, and
 * ApprovalSignalVerifier counts that fact as true only with a signed
 * approval from a trusted person. So no combination of caller declared
 * facts approves on its own, and a refusal reason cannot teach an agent
 * which flag to flip.
 */

function loadPolicy(name: string, version: string): Policy {
  return JSON.parse(
    readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../../policies",
        name,
        version,
        "policy.json",
      ),
      "utf8",
    ),
  ) as Policy;
}

/**
 * True when the condition cannot hold unless `fact` is true: the fact
 * itself with is_true (or eq true), or an `all` with such a child, or an
 * `any` whose every branch requires it.
 */
function requiresTrue(condition: PolicyCondition, fact: string): boolean {
  if ("fact" in condition) {
    return (
      condition.fact === fact &&
      (condition.operator === "is_true" ||
        (condition.operator === "eq" && condition.value === true))
    );
  }

  if ("all" in condition) {
    return condition.all.some((child) => requiresTrue(child, fact));
  }

  if ("any" in condition) {
    return condition.any.every((child) => requiresTrue(child, fact));
  }

  return false;
}

interface Case {
  readonly name: string;
  readonly version: string;
  readonly approvalFact: string;
  readonly resourceId: string;
  /** Every caller declared fact at its most permissive value. */
  readonly permissive: PolicySignals;
  /**
   * One caller declared fact that must refuse even with an approval.
   * Absent for a read, whose only condition is the approval.
   */
  readonly failing?: PolicySignals;
}

const CASES: readonly Case[] = [
  {
    name: "github-pr-approval",
    version: "1.1.0",
    approvalFact: "mergeApproved",
    resourceId: "target",
    permissive: {
      repositoryAuthorized: true,
      requiredReviewsCompleted: true,
      statusChecksPassed: true,
      branchProtected: true,
      riskScore: 0,
    },
    failing: { riskScore: 99 },
  },
  {
    name: "llm-tool-call",
    version: "1.1.0",
    approvalFact: "humanApproval",
    resourceId: "target",
    permissive: {
      toolAllowed: true,
      resourceAuthorized: true,
      executionEnvironment: "production",
      riskScore: 0,
    },
    failing: { riskScore: 99 },
  },
  {
    name: "customer-refund",
    version: "1.2.0",
    approvalFact: "managerApproved",
    resourceId: "parameters.orderId",
    permissive: {
      refundEligible: true,
      fraudCheckPassed: true,
      refundAmount: 1,
    },
    failing: { fraudCheckPassed: false },
  },
  {
    name: "github-pr-read",
    version: "1.1.0",
    approvalFact: "readApproved",
    resourceId: "target",
    permissive: {},
  },
  {
    name: "hubspot-deal-read",
    version: "1.0.0",
    approvalFact: "readApproved",
    resourceId: "parameters.dealId",
    permissive: {},
  },
  {
    name: "hubspot-deal-update",
    version: "1.1.0",
    approvalFact: "dealUpdateApproved",
    resourceId: "parameters.dealId",
    permissive: {
      dealStageChangeRequested: true,
      dealStageTransitionAllowed: true,
    },
    failing: { dealStageTransitionAllowed: false },
  },
  {
    name: "slack-post-message",
    version: "1.1.0",
    approvalFact: "postApproved",
    resourceId: "target",
    permissive: { contentApproved: true, channelAuthorized: true },
    failing: { contentApproved: false },
  },
  {
    name: "access-control",
    version: "1.1.0",
    approvalFact: "humanApproved",
    resourceId: "target",
    permissive: {
      userAuthenticated: true,
      userAuthorized: true,
      mfaVerified: true,
      deviceTrusted: true,
      sessionRiskScore: 0,
    },
    failing: { mfaVerified: false },
  },
  {
    name: "agent-vendor-payment",
    version: "1.1.0",
    approvalFact: "humanApproved",
    resourceId: "target",
    permissive: {
      vendorAllowed: true,
      withinCredentialLimit: true,
      withinVelocityLimit: true,
      paymentAmount: 100,
    },
    failing: { vendorAllowed: false },
  },
  {
    name: "api-key-issuance",
    version: "1.1.0",
    approvalFact: "humanApproved",
    resourceId: "target",
    permissive: {
      requesterVerified: true,
      scopeAuthorized: true,
      keyLifetimeDays: 30,
      riskScore: 0,
    },
    failing: { riskScore: 99 },
  },
  {
    name: "connector-capability",
    version: "1.1.0",
    approvalFact: "humanApproved",
    resourceId: "target",
    permissive: { capability: "crm:read" },
    failing: { capability: "payments:refund", paymentAmount: 999_999 },
  },
  {
    name: "database-change",
    version: "3.1.0",
    approvalFact: "humanApproved",
    resourceId: "target",
    permissive: {
      changeApproved: true,
      migrationValidated: true,
      backupAvailable: true,
      maintenanceWindow: true,
      riskScore: 0,
    },
    failing: { riskScore: 99 },
  },
  {
    name: "expense-reimbursement",
    version: "1.1.0",
    approvalFact: "humanApproved",
    resourceId: "target",
    permissive: {
      employeeVerified: true,
      receiptAttached: true,
      categoryApproved: true,
      expenseAmount: 100,
    },
    failing: { expenseAmount: 999_999 },
  },
  {
    name: "production-deployment",
    version: "1.1.0",
    approvalFact: "humanApproved",
    resourceId: "target",
    permissive: {
      deploymentApproved: true,
      changeVerified: true,
      rollbackReady: true,
      maintenanceWindow: true,
      riskScore: 0,
    },
    failing: { riskScore: 99 },
  },
  {
    name: "rag-document-access",
    version: "1.1.0",
    approvalFact: "humanApproved",
    resourceId: "target",
    permissive: {
      requesterAuthenticated: true,
      requesterAuthorized: true,
      documentAccessible: true,
      classificationPermitted: true,
      riskScore: 0,
    },
    failing: { riskScore: 99 },
  },
  {
    name: "vendor-payment",
    version: "2.1.0",
    approvalFact: "humanApproved",
    resourceId: "target",
    permissive: {
      vendorVerified: true,
      invoiceVerified: true,
      paymentApproved: true,
      sufficientFunds: true,
      paymentAmount: 100,
      riskScore: 0,
    },
    failing: { riskScore: 99 },
  },
];

describe.each(CASES)(
  "$name $version: only a signed approval authorizes",
  ({ name, version, approvalFact, resourceId, permissive, failing }) => {
    const policy = loadPolicy(name, version);
    const engine = new PolicyEngine();

    it("is a valid policy", () => {
      expect(() => new PolicyValidator().validate(policy)).not.toThrow();
      expect(policy.policyVersion).toBe(version);
    });

    it(`declares ${approvalFact} as approval backed`, () => {
      expect(policy.approvalSignals?.[approvalFact]?.resourceId).toBe(
        resourceId,
      );
    });

    it(`every approve rule requires ${approvalFact} true`, () => {
      const approveRules = policy.rules.filter(
        (rule) => rule.outcome.action === "approve",
      );

      expect(approveRules.length).toBeGreaterThan(0);

      for (const rule of approveRules) {
        expect(requiresTrue(rule.condition, approvalFact), rule.id).toBe(true);
      }
    });

    it("refuses every caller declared fact at its most permissive value, without the approval fact", () => {
      expect(engine.evaluate(policy, permissive).outcome).toBe(
        PolicyOutcome.REJECT,
      );
      expect(
        engine.evaluate(policy, { ...permissive, [approvalFact]: false })
          .outcome,
      ).toBe(PolicyOutcome.REJECT);
    });

    it(`approves with ${approvalFact} true (the signed approval is checked by ApprovalSignalVerifier)`, () => {
      expect(
        engine.evaluate(policy, { ...permissive, [approvalFact]: true })
          .outcome,
      ).toBe(PolicyOutcome.APPROVE);
    });

    it.skipIf(failing === undefined)(
      "still refuses on a failing caller declared fact, even with an approval",
      () => {
        expect(
          engine.evaluate(policy, {
            ...permissive,
            [approvalFact]: true,
            ...failing,
          }).outcome,
        ).toBe(PolicyOutcome.REJECT);
      },
    );
  },
);

//
// No agent action is ever authorized without a signed human approval.
// These older versions approve without one, so they are kept only as
// history: each is refused when it loads.
//
describe.each([
  ["access-control", "1.0.0"],
  ["agent-vendor-payment", "1.0.0"],
  ["api-key-issuance", "1.0.0"],
  ["connector-capability", "1.0.0"],
  ["customer-refund", "1.0.0"],
  ["customer-refund", "1.1.0"],
  ["database-change", "3.0.0"],
  ["expense-reimbursement", "1.0.0"],
  ["github-pr-approval", "1.0.0"],
  ["github-pr-read", "1.0.0"],
  ["hubspot-deal-update", "1.0.0"],
  ["llm-tool-call", "1.0.0"],
  ["production-deployment", "1.0.0"],
  ["rag-document-access", "1.0.0"],
  ["slack-post-message", "1.0.0"],
  ["vendor-payment", "2.0.0"],
])("%s %s", (name, version) => {
  it("is refused because it approves without a signed human approval", () => {
    expect(() =>
      new PolicyValidator().validate(loadPolicy(name, version)),
    ).toThrow(/approves without a signed human approval/);
  });
});
