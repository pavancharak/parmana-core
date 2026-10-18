import { describe, expect, it } from "vitest";

import { PolicyChangeCrypto } from "@parmana/crypto";
import type { PolicyChangeApprovalRecord } from "@parmana/shared";
import { MemoryPolicyChangeApprovalRecordRepository } from "@parmana/storage";

import { PolicyGovernanceAnchorResolver } from "../../src/governance/PolicyGovernanceAnchorResolver.js";

/**
 * Same fixture as PolicyGovernanceExecutionVerifier.test.ts -- this
 * resolver performs the identical three checks, just returns a status
 * instead of a violation, so the exact same fixtures exercise it.
 */
async function fixtureRecord(
  crypto: PolicyChangeCrypto,
  overrides: Partial<Omit<PolicyChangeApprovalRecord, "signature">> = {},
): Promise<PolicyChangeApprovalRecord> {
  const draft: Omit<PolicyChangeApprovalRecord, "signature"> = {
    policyChangeApprovalRecordId: `pcar-${Math.random()}`,
    pendingPolicyChangeId: "ppc-1",
    policyName: "vendor-payment",
    policyVersion: "1.0.0",
    proposedBy: "human-maker",
    approvedBy: "human-checker",
    proposedAt: new Date("2026-08-01T00:00:00.000Z"),
    approvedAt: new Date("2026-08-01T00:05:00.000Z"),
    contentHashAfter: "sha256-placeholder",
    ...overrides,
  };

  const signature = await crypto.sign(draft as PolicyChangeApprovalRecord);

  return { ...draft, signature };
}

describe("PolicyGovernanceAnchorResolver", () => {
  it("resolves NO_APPROVAL_RECORD, with no approvalRecordId, when no record exists for the policy", async () => {
    const resolver = new PolicyGovernanceAnchorResolver(
      new MemoryPolicyChangeApprovalRecordRepository(),
      new PolicyChangeCrypto(),
    );

    const anchor = await resolver.resolve("never-approved", "1.0.0", "hash123");

    expect(anchor.status).toBe("NO_APPROVAL_RECORD");
    expect(anchor.approvalRecordId).toBeUndefined();
  });

  it("resolves SIGNATURE_INVALID, naming the approvalRecordId, when the record was tampered with after signing", async () => {
    const crypto = new PolicyChangeCrypto();
    const repository = new MemoryPolicyChangeApprovalRecordRepository();

    const record = await fixtureRecord(crypto, { contentHashAfter: "hash123" });
    await repository.create({ ...record, approvedBy: "someone-else" });

    const resolver = new PolicyGovernanceAnchorResolver(repository, crypto);

    const anchor = await resolver.resolve("vendor-payment", "1.0.0", "hash123");

    expect(anchor.status).toBe("SIGNATURE_INVALID");
    expect(anchor.approvalRecordId).toBe(record.policyChangeApprovalRecordId);
  });

  it("resolves CONTENT_MISMATCH, naming the approvalRecordId, when live content no longer matches contentHashAfter", async () => {
    const crypto = new PolicyChangeCrypto();
    const repository = new MemoryPolicyChangeApprovalRecordRepository();

    const record = await fixtureRecord(crypto, {
      contentHashAfter: "approved-hash",
    });
    await repository.create(record);

    const resolver = new PolicyGovernanceAnchorResolver(repository, crypto);

    const anchor = await resolver.resolve(
      "vendor-payment",
      "1.0.0",
      "different-live-hash",
    );

    expect(anchor.status).toBe("CONTENT_MISMATCH");
    expect(anchor.approvalRecordId).toBe(record.policyChangeApprovalRecordId);
  });

  it("resolves VERIFIED, naming the approvalRecordId, when the record exists, verifies, and content matches", async () => {
    const crypto = new PolicyChangeCrypto();
    const repository = new MemoryPolicyChangeApprovalRecordRepository();

    const record = await fixtureRecord(crypto, {
      contentHashAfter: "matching-hash",
    });
    await repository.create(record);

    const resolver = new PolicyGovernanceAnchorResolver(repository, crypto);

    const anchor = await resolver.resolve(
      "vendor-payment",
      "1.0.0",
      "matching-hash",
    );

    expect(anchor.status).toBe("VERIFIED");
    expect(anchor.approvalRecordId).toBe(record.policyChangeApprovalRecordId);
  });

  it("never throws, and always resolves -- there is no rejection path, unlike PolicyGovernanceExecutionVerifier", async () => {
    const resolver = new PolicyGovernanceAnchorResolver(
      new MemoryPolicyChangeApprovalRecordRepository(),
      new PolicyChangeCrypto(),
    );

    await expect(
      resolver.resolve("any-policy", "1.0.0", "any-hash"),
    ).resolves.toMatchObject({ status: "NO_APPROVAL_RECORD" });
  });
});
