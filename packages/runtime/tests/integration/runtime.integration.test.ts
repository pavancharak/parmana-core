import path from "node:path";
import { describe, expect, it } from "vitest";

import type { BusinessTransaction } from "@parmana/shared";

import { FilePolicyRepository } from "@parmana/policy";
import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import { RuntimeBuilder } from "../../src/RuntimeBuilder.js";

import {
  testApprovalSignalVerifier,
  withTestApproval,
} from "../../../../test-support/approvals.js";

describe("Runtime Integration", () => {
  it("executes a complete vendor payment transaction", async () => {
    const policyRepository = new FilePolicyRepository(
      path.resolve(import.meta.dirname, "../../../../policies"),
    );

    const trustRecords = new MemoryExecutionTrustRecordRepository();

    const runtime = new RuntimeBuilder()
      .withPolicyRepository(policyRepository)
      .withSignalStateVerifier(testApprovalSignalVerifier())
      .build(trustRecords);

    const { trustRecord } = await runtime.execute(
      await withTestApproval({
        policy: {
          name: "vendor-payment",
          version: "2.1.0",
          schemaVersion: "1.0.0",
        },

        signals: {
          vendorVerified: true,
          invoiceVerified: true,
          paymentApproved: true,
          sufficientFunds: true,
          paymentAmount: 5000,
          riskScore: 10,
          // Must match intent.target exactly: vendor-payment/2.1.0
          // declares boundSignals requiring vendorId === intent.target.
          vendorId: "vendor://payments",
        },

        authority: {
          authorityId: "authority-001",
        },

        authorization: {
          authorizationId: "authorization-001",
        },

        intent: {
          intentId: "intent-001",
          authorizationId: "authorization-001",
          action: "payments:execute",
          target: "vendor://payments",
          parameters: {
            amount: 5000,
          },
          createdAt: new Date(),
        },
      } as BusinessTransaction),
    );

    expect(trustRecord).toBeDefined();

    expect(trustRecord.executions.length).toBe(1);

    expect(trustRecord.executions[0].decision.outcome).toBe("APPROVED");

    expect(trustRecord.verifications).toHaveLength(0);

    expect(trustRecord.receipts).toHaveLength(0);
  });
});
