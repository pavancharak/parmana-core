import path from "node:path";
import { describe, expect, it } from "vitest";

import type { BusinessTransaction } from "@parmana/shared";

import { FilePolicyRepository } from "@parmana/policy";
import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import { KillSwitchActiveError } from "@parmana/shared";
import { RuntimeBuilder } from "../../src/RuntimeBuilder.js";

import {
  testApprovalSignalVerifier,
  withTestApproval,
} from "../../../../test-support/approvals.js";

/**
 * A kill switch tripped after a request passed the HTTP guard, but before the
 * action is released, must refuse the release (ADR-0017). The API registers
 * the kill-switch check as a runtime hook that runs just before release.
 */
describe("Runtime release refused by a kill switch", () => {
  it("does not release an action when a pre-release hook refuses it", async () => {
    const policyRepository = new FilePolicyRepository(
      path.resolve(import.meta.dirname, "../../../../policies"),
    );

    const runtime = new RuntimeBuilder()
      .withPolicyRepository(policyRepository)
      .withSignalStateVerifier(testApprovalSignalVerifier())
      .addHook({
        beforeExecution: async () => {
          throw new KillSwitchActiveError();
        },
      })
      .build(new MemoryExecutionTrustRecordRepository());

    const attempt = runtime.execute(
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
          vendorId: "vendor://payments",
        },
        authority: { authorityId: "authority-001" },
        authorization: { authorizationId: "authorization-001" },
        intent: {
          intentId: "intent-001",
          authorizationId: "authorization-001",
          action: "payments:execute",
          target: "vendor://payments",
          parameters: { amount: 5000 },
          createdAt: new Date(),
        },
      } as BusinessTransaction),
    );

    await expect(attempt).rejects.toMatchObject({
      status: 503,
      code: "KILL_SWITCH_ACTIVE",
    });
  });
});
