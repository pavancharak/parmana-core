import crypto from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { PolicyChangeCrypto } from "@parmana/crypto";
import { FilePolicyRepository, PolicyAction } from "@parmana/policy";
import type { Policy } from "@parmana/policy";
import { RuntimeBuilder } from "@parmana/runtime";
import {
  BusinessTransactionStatus,
  PendingPolicyChangeStatus,
} from "@parmana/shared";
import type {
  Authority,
  Authorization,
  BusinessTransaction,
  PendingPolicyChange,
  TransactionMetadata,
} from "@parmana/shared";
import {
  MemoryExecutionTrustRecordRepository,
  MemoryPolicyChangeApprovalRecordRepository,
} from "@parmana/storage";

import { GovernedPolicyVersionSource } from "../../src/governance/GovernedPolicyVersionSource.js";
import { PolicyChangeApprovalService } from "../../src/governance/PolicyChangeApprovalService.js";
import { PolicyGovernanceExecutionVerifier } from "../../src/governance/PolicyGovernanceExecutionVerifier.js";
import {
  testApprovalSignalVerifier,
  withTestApproval,
} from "../../../../test-support/approvals.js";

/**
 * G-66, end to end through RuntimeBuilder with policy governance
 * enforced, the way production wires it: paytm:refund is bound to the
 * policy NAME customer-refund in code, and the version in effect is the
 * one most recently approved. A new version goes live by being approved,
 * an older one is refused, and approving an older one again rolls back.
 *
 * Uses a scratch policy directory and trivially approving policies, so
 * only the version decides the outcome.
 */
describe("policy version taken from policy governance (G-66)", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "parmana-g66-"));

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  const policyRepository = new FilePolicyRepository(scratch);
  const policyChangeCrypto = new PolicyChangeCrypto();
  const approvalRecords = new MemoryPolicyChangeApprovalRecordRepository();

  const approvalService = new PolicyChangeApprovalService({
    policyRepository,
    policyChangeCrypto,
    policyChangeApprovalRecordRepository: approvalRecords,
  });

  const runtime = new RuntimeBuilder()
    .withPolicyRepository(policyRepository)
    .withPolicyExecutionVerifier(
      new PolicyGovernanceExecutionVerifier(
        approvalRecords,
        policyChangeCrypto,
      ),
    )
    .withCurrentPolicyVersions(new GovernedPolicyVersionSource(approvalRecords))
    .withSignalStateVerifier(testApprovalSignalVerifier())
    .build(new MemoryExecutionTrustRecordRepository());

  function refundPolicy(version: string): Policy {
    return {
      policyId: "customer-refund",
      policyVersion: version,
      schemaVersion: "1.0.0",
      approvalSignals: {
        managerApproved: { resourceId: "parameters.orderId" },
      },
      rules: [
        {
          id: "approve",
          condition: { fact: "managerApproved", operator: "is_true" },
          outcome: {
            action: PolicyAction.APPROVE,
            reason: `approved under ${version}`,
          },
        },
      ],
    };
  }

  async function approve(version: string): Promise<void> {
    // approvedAt decides which version is current; keep approvals apart.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const change: PendingPolicyChange = {
      pendingPolicyChangeId: crypto.randomUUID(),
      policyName: "customer-refund",
      policyVersion: version,
      proposedContent: refundPolicy(
        version,
      ) as unknown as PendingPolicyChange["proposedContent"],
      proposedBy: "maker",
      proposedAt: new Date(),
      status: PendingPolicyChangeStatus.PENDING_APPROVAL,
      reason: "test",
    };

    await approvalService.approve(change, "checker");
  }

  function refund(version: string): Promise<BusinessTransaction> {
    const id = crypto.randomUUID();

    return withTestApproval(
      {
        businessTransactionId: id,
        metadata: { executionMode: "SYNC" } as unknown as TransactionMetadata,
        authority: {} as Authority,
        authorization: {} as Authorization,
        intent: {
          intentId: `${id}-intent`,
          authorizationId: `${id}-authorization`,
          action: "paytm:refund",
          target: "paytm://orders/order-1",
          parameters: { orderId: "order-1", amount: 500 },
          createdAt: new Date(),
        },
        policy: { name: "customer-refund", version, schemaVersion: "1.0.0" },
        signals: {},
        status: BusinessTransactionStatus.RECEIVED,
        createdAt: new Date(),
      },
      refundPolicy(version),
    );
  }

  async function outcome(version: string): Promise<string> {
    try {
      const result = await runtime.execute(await refund(version));
      return String(result.trustRecord.executions[0]?.decision.outcome);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  it("with no approved version, refuses every version", async () => {
    await policyRepository.save(
      "customer-refund",
      "1.0.0",
      refundPolicy("1.0.0"),
    );

    expect(await outcome("1.0.0")).toContain("Execution rejected");
  });

  it("runs the approved version", async () => {
    await approve("1.0.0");

    expect(await outcome("1.0.0")).toBe("APPROVED");
  });

  it("makes a newly approved version current with no code change, and refuses the older one", async () => {
    await approve("1.1.0");

    expect(await outcome("1.1.0")).toBe("APPROVED");

    const older = await outcome("1.0.0");
    expect(older).toContain("Execution rejected");
    // Refused as superseded (G-74), naming the version in effect.
    expect(older).toContain('the version in effect is "1.1.0"');
  });

  it("rolls back when an older version is approved again", async () => {
    await approve("1.0.0");

    expect(await outcome("1.0.0")).toBe("APPROVED");
    expect(await outcome("1.1.0")).toContain(
      'the version in effect is "1.0.0"',
    );
  });

  it("refuses when the version in effect cannot be looked up", async () => {
    const broken = new RuntimeBuilder()
      .withPolicyRepository(policyRepository)
      .withPolicyExecutionVerifier(
        new PolicyGovernanceExecutionVerifier(
          approvalRecords,
          policyChangeCrypto,
        ),
      )
      .withCurrentPolicyVersions({
        async currentVersion() {
          throw new Error("approval records unreachable");
        },
      })
      .build(new MemoryExecutionTrustRecordRepository());

    await expect(broken.execute(await refund("1.0.0"))).rejects.toThrow(
      "approval records unreachable",
    );
  });
});
