import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import path from "node:path";

import { PolicyEngine } from "../../src/PolicyEngine.js";

import type { Policy } from "../../src/types/Policy.js";

import type { PolicySignals } from "../../src/types/PolicySignals.js";

describe("Reference Policy Determinism", () => {
  const engine = new PolicyEngine();

  interface TestCase {
    name: string;
    file: string;
    signals: PolicySignals;
  }

  const cases: TestCase[] = [
    {
      name: "access-control",
      file: "../refused/access-control/1.0.0/policy.json",
      signals: {
        userAuthenticated: true,
        userAuthorized: true,
        mfaVerified: true,
        deviceTrusted: true,
        sessionRiskScore: 10,
      },
    },
    {
      name: "customer-refund",
      file: "../refused/customer-refund/1.0.0/policy.json",
      signals: {
        refundEligible: true,
        managerApproved: true,
        fraudCheckPassed: true,
        refundAmount: 5000,
      },
    },
    {
      name: "customer-refund 1.1.0",
      file: "../refused/customer-refund/1.1.0/policy.json",
      signals: {
        refundEligible: true,
        managerApproved: false,
        fraudCheckPassed: true,
        refundAmount: 5000,
      },
    },
    {
      name: "database-change",
      file: "../refused/database-change/3.0.0/policy.json",
      signals: {
        changeApproved: true,
        migrationValidated: true,
        backupAvailable: true,
        maintenanceWindow: true,
        riskScore: 10,
      },
    },
    {
      name: "llm-tool-call",
      file: "../refused/llm-tool-call/1.0.0/policy.json",
      signals: {
        toolAllowed: true,
        resourceAuthorized: true,
        humanApproval: true,
        executionEnvironment: "production",
        riskScore: 10,
      },
    },
    {
      name: "production-deployment",
      file: "../refused/production-deployment/1.0.0/policy.json",
      signals: {
        deploymentApproved: true,
        changeVerified: true,
        rollbackReady: true,
        maintenanceWindow: true,
        riskScore: 10,
      },
    },
    {
      name: "rag-document-access",
      file: "../refused/rag-document-access/1.0.0/policy.json",
      signals: {
        requesterAuthenticated: true,
        requesterAuthorized: true,
        documentAccessible: true,
        classificationPermitted: true,
        riskScore: 10,
      },
    },
    {
      name: "payment-limit",
      file: "payment-limit/1.0.0/policy.json",
      signals: {
        vendorVerified: true,
        invoiceVerified: true,
        paymentApproved: true,
        sufficientFunds: true,
        paymentAmount: 1000,
        riskScore: 10,
      },
    },
  ];

  for (const testCase of cases) {
    it(`${testCase.name} is deterministic`, () => {
      const policy = JSON.parse(
        readFileSync(
          path.resolve(
            import.meta.dirname,
            "../../../../fixtures/policies",
            testCase.file,
          ),
          "utf8",
        ),
      ) as Policy;

      const first = engine.evaluate(policy, testCase.signals);

      const second = engine.evaluate(policy, testCase.signals);

      expect(second).toEqual(first);
    });
  }
});
