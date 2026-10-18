import { describe, it, expect } from "vitest";

import type { PolicyChangeApprovalRecord } from "@parmana/shared";

import { PolicyChangeCrypto } from "../../src/index.js";

function draftRecord(
  overrides: Partial<PolicyChangeApprovalRecord> = {},
): Omit<PolicyChangeApprovalRecord, "signature"> {
  return {
    policyChangeApprovalRecordId: "pcar-1",
    pendingPolicyChangeId: "ppc-1",
    policyName: "vendor-payment",
    policyVersion: "2.0.0",
    proposedBy: "human-maker",
    approvedBy: "human-checker",
    proposedAt: new Date("2026-08-01T00:00:00.000Z"),
    approvedAt: new Date("2026-08-01T00:05:00.000Z"),
    contentHashBefore: "sha256-before",
    contentHashAfter: "sha256-after",
    ...overrides,
  };
}

describe("PolicyChangeCrypto sign/verify", () => {
  it("signs and verifies a round-tripped record", async () => {
    const crypto = new PolicyChangeCrypto();

    const draft = draftRecord();

    const signature = await crypto.sign(draft as PolicyChangeApprovalRecord);

    const record: PolicyChangeApprovalRecord = {
      ...draft,
      signature,
    };

    const transported = JSON.parse(
      JSON.stringify(record),
    ) as PolicyChangeApprovalRecord;

    await expect(crypto.verify(transported)).resolves.toBe(true);
  });

  it("verifies a record with no contentHashBefore (a brand-new policy version)", async () => {
    const crypto = new PolicyChangeCrypto();

    const draft = draftRecord();
    delete (draft as { contentHashBefore?: string }).contentHashBefore;

    const signature = await crypto.sign(draft as PolicyChangeApprovalRecord);

    const record: PolicyChangeApprovalRecord = {
      ...draft,
      signature,
    };

    await expect(crypto.verify(record)).resolves.toBe(true);
  });

  it("rejects a record whose content was tampered with after signing", async () => {
    const crypto = new PolicyChangeCrypto();

    const draft = draftRecord();
    const signature = await crypto.sign(draft as PolicyChangeApprovalRecord);

    const tampered: PolicyChangeApprovalRecord = {
      ...draft,
      contentHashAfter: "sha256-attacker-controlled",
      signature,
    };

    await expect(crypto.verify(tampered)).resolves.toBe(false);
  });

  it("rejects a record with a tampered approvedBy field", async () => {
    const crypto = new PolicyChangeCrypto();

    const draft = draftRecord();
    const signature = await crypto.sign(draft as PolicyChangeApprovalRecord);

    const tampered: PolicyChangeApprovalRecord = {
      ...draft,
      approvedBy: "attacker-controlled-checker",
      signature,
    };

    await expect(crypto.verify(tampered)).resolves.toBe(false);
  });

  it("hashPolicyContent is deterministic for the same content and differs for different content", async () => {
    const crypto = new PolicyChangeCrypto();

    const content = { policyId: "vendor-payment", policyVersion: "2.0.0" };

    const first = await crypto.hashPolicyContent(content);
    const second = await crypto.hashPolicyContent(content);
    const different = await crypto.hashPolicyContent({
      ...content,
      policyVersion: "3.0.0",
    });

    expect(first).toBe(second);
    expect(first).not.toBe(different);
  });
});
