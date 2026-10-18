import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import path from "node:path";

import { PolicyEngine } from "../../src/PolicyEngine.js";

import type { Policy } from "../../src/types/Policy.js";
import type { PolicySignals } from "../../src/types/PolicySignals.js";

import { PolicyOutcome } from "../../src/types/PolicyOutcome.js";

describe("Reference Policy Negative Evaluation", () => {
  const engine = new PolicyEngine();

  interface TestCase {
    name: string;
    file: string;
    signals: PolicySignals;
  }

  const cases: TestCase[] = [
    {
      name: "access-control",
      file: "access-control/1.0.0/policy.json",
      signals: {
        userAuthenticated: false,
        userAuthorized: false,
        mfaVerified: false,
        deviceTrusted: false,
        sessionRiskScore: 90,
      },
    },
    {
      name: "customer-refund",
      file: "customer-refund/1.0.0/policy.json",
      signals: {
        refundEligible: false,
        managerApproved: false,
        fraudCheckPassed: false,
        refundAmount: 50000,
      },
    },
    {
      name: "customer-refund 1.1.0",
      file: "customer-refund/1.1.0/policy.json",
      signals: {
        refundEligible: true,
        managerApproved: false,
        fraudCheckPassed: true,
        refundAmount: 50000,
      },
    },
    {
      name: "database-change",
      file: "database-change/3.0.0/policy.json",
      signals: {
        changeApproved: false,
        migrationValidated: false,
        backupAvailable: false,
        maintenanceWindow: false,
        riskScore: 90,
      },
    },
    {
      name: "github-pr-approval",
      file: "github-pr-approval/1.0.0/policy.json",
      signals: {
        repositoryAuthorized: false,
        requiredReviewsCompleted: false,
        statusChecksPassed: false,
        branchProtected: false,
        riskScore: 90,
      },
    },
    {
      name: "llm-tool-call",
      file: "llm-tool-call/1.0.0/policy.json",
      signals: {
        toolAllowed: false,
        resourceAuthorized: false,
        humanApproval: false,
        executionEnvironment: "development",
        riskScore: 90,
      },
    },
    {
      name: "production-deployment",
      file: "production-deployment/1.0.0/policy.json",
      signals: {
        deploymentApproved: false,
        changeVerified: false,
        rollbackReady: false,
        maintenanceWindow: false,
        riskScore: 90,
      },
    },
    {
      name: "rag-document-access",
      file: "rag-document-access/1.0.0/policy.json",
      signals: {
        requesterAuthenticated: false,
        requesterAuthorized: false,
        documentAccessible: false,
        classificationPermitted: false,
        riskScore: 90,
      },
    },
    {
      name: "vendor-payment",
      file: "vendor-payment/2.0.0/policy.json",
      signals: {
        vendorVerified: false,
        invoiceVerified: false,
        paymentApproved: false,
        sufficientFunds: false,
        paymentAmount: 0,
        riskScore: 90,
      },
    },
  ];

  for (const testCase of cases) {
    it(`${testCase.name} rejects invalid signals`, () => {
      const policy = JSON.parse(
        readFileSync(
          path.resolve(
            import.meta.dirname,
            "../../../../policies",
            testCase.file,
          ),
          "utf8",
        ),
      ) as Policy;

      const decision = engine.evaluate(policy, testCase.signals);

      expect(decision.outcome).toBe(PolicyOutcome.REJECT);

      expect(decision.reason.length).toBeGreaterThan(0);

      expect(decision.matchedRuleId).not.toBe("none");

      expect(decision.evaluatedRules).toBeGreaterThan(0);
    });
  }
});
