import { describe, expect, it } from "vitest";

import { CryptoBootstrap, TrustRecordHasher } from "@parmana/crypto";
import {
  BusinessTransaction,
  Decision,
  DecisionOutcome,
  Execution,
  ExecutionMode,
  ExecutionStatus,
} from "@parmana/shared";

import { BusinessTrustRecordBuilder } from "../../src/BusinessTrustRecordBuilder.js";
import type { RuntimeContext } from "../../src/context/RuntimeContext.js";

function decision(): Decision {
  return {
    decisionId: "decision-1",
    intentId: "intent-1",
    policy: {
      name: "customer-refund",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    },
    signals: {},
    outcome: DecisionOutcome.APPROVED,
    evaluatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function transaction(
  policyOverrides: Record<string, unknown> = {},
): BusinessTransaction {
  return {
    businessTransactionId: "txn-1",
    metadata: { businessTransactionId: "txn-1" },
    policy: {
      name: "customer-refund",
      version: "1.0.0",
      schemaVersion: "1.0.0",
      ...policyOverrides,
    },
    signals: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
  } as unknown as BusinessTransaction;
}

function execution(connectorEvidenceHash?: string): Execution {
  return {
    executionId: "exec-1",
    businessTransactionId: "txn-1",
    decision: decision(),
    status: ExecutionStatus.COMPLETED,
    mode: ExecutionMode.SYNC,
    startedAt: new Date("2026-01-01T00:00:01Z"),
    ...(connectorEvidenceHash !== undefined && {
      evidence: {
        businessTransactionId: "txn-1",
        action: "customer-refund",
        target: "CUST1024",
        parameters: {},
        success: true,
        executedAt: new Date("2026-01-01T00:00:02Z"),
        attributes: {
          connector: { connectorEvidenceHash },
        },
      },
    }),
  };
}

/**
 * docs/VERIFICATION-GAPS.md G-45's residual "Record 3 is outside all
 * three [policy-governance] mechanisms" gap: nothing linked
 * transaction.policy.contentHash/governanceAnchor to what a connector
 * actually did. These tests prove the new evidenceAnchor field closes
 * that, and stays honest when there's nothing to anchor.
 */
describe("BusinessTrustRecordBuilder evidenceAnchor", () => {
  it("builds evidenceAnchor from policyContentHash, governanceAnchor, and connectorEvidenceHash when all three are present", async () => {
    const context: RuntimeContext = {
      transaction: transaction({
        contentHash: "policy-hash-abc",
        governanceAnchor: { status: "VERIFIED", approvalRecordId: "pcar-1" },
      }),
      decision: decision(),
      execution: execution("connector-hash-xyz"),
    };

    const record = await new BusinessTrustRecordBuilder().build(context);

    expect(record.evidenceAnchor).toBeDefined();
    expect(record.evidenceAnchor?.policyContentHash).toBe("policy-hash-abc");
    expect(record.evidenceAnchor?.governanceAnchorStatus).toBe("VERIFIED");
    expect(record.evidenceAnchor?.connectorEvidenceHash).toBe(
      "connector-hash-xyz",
    );

    const independentlyComputed = await new TrustRecordHasher(
      CryptoBootstrap.create(),
    ).hash({
      policyContentHash: "policy-hash-abc",
      governanceAnchorStatus: "VERIFIED",
      connectorEvidenceHash: "connector-hash-xyz",
    });

    expect(record.evidenceAnchor?.anchorHash).toBe(independentlyComputed);
  });

  it("builds a partial evidenceAnchor when no connector executed (no connector registered for the capability)", async () => {
    const context: RuntimeContext = {
      transaction: transaction({
        contentHash: "policy-hash-abc",
        governanceAnchor: { status: "NO_APPROVAL_RECORD" },
      }),
      decision: decision(),
      execution: execution(), // no connector evidence attached
    };

    const record = await new BusinessTrustRecordBuilder().build(context);

    expect(record.evidenceAnchor).toBeDefined();
    expect(record.evidenceAnchor?.policyContentHash).toBe("policy-hash-abc");
    expect(record.evidenceAnchor?.governanceAnchorStatus).toBe(
      "NO_APPROVAL_RECORD",
    );
    expect(record.evidenceAnchor?.connectorEvidenceHash).toBeUndefined();
  });

  it("omits evidenceAnchor entirely when there is nothing to anchor", async () => {
    const context: RuntimeContext = {
      // No contentHash, no governanceAnchor -- e.g. a deployment with no
      // PolicyGovernanceAnchorResolver configured, on a Trust Record
      // predating G-24 entirely.
      transaction: transaction(),
      decision: decision(),
      execution: execution(),
    };

    const record = await new BusinessTrustRecordBuilder().build(context);

    expect(record.evidenceAnchor).toBeUndefined();
  });

  it("folds evidenceAnchor into the overall trustRecordHash -- a different governance status yields a different trustRecordHash for otherwise-identical inputs", async () => {
    const builder = new BusinessTrustRecordBuilder();

    const verified = await builder.build({
      transaction: transaction({
        contentHash: "policy-hash-abc",
        governanceAnchor: { status: "VERIFIED" },
      }),
      decision: decision(),
      execution: execution("connector-hash-xyz"),
    });

    const mismatch = await builder.build({
      transaction: transaction({
        contentHash: "policy-hash-abc",
        governanceAnchor: { status: "CONTENT_MISMATCH" },
      }),
      decision: decision(),
      execution: execution("connector-hash-xyz"),
    });

    expect(verified.evidenceAnchor?.anchorHash).not.toBe(
      mismatch.evidenceAnchor?.anchorHash,
    );
    expect(verified.trustRecordHash).not.toBe(mismatch.trustRecordHash);
  });
});
