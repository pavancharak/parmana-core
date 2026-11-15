import { describe, expect, it } from "vitest";

import type { Pool } from "pg";

import type { PolicyChangeApprovalRecord } from "@parmana/shared";

import { MemoryPolicyChangeApprovalRecordRepository } from "../../src/memory/MemoryPolicyChangeApprovalRecordRepository.js";
import { PostgresPolicyChangeApprovalRecordRepository } from "../../src/postgres/PostgresPolicyChangeApprovalRecordRepository.js";

function record(
  id: string,
  policyVersion: string,
  approvedAt: string,
): PolicyChangeApprovalRecord {
  return {
    policyChangeApprovalRecordId: id,
    pendingPolicyChangeId: `change-${id}`,
    policyName: "customer-refund",
    policyVersion,
    proposedBy: "maker",
    approvedBy: "checker",
    proposedAt: new Date(approvedAt),
    approvedAt: new Date(approvedAt),
    contentHashAfter: `hash-${id}`,
    signature: {
      algorithm: "ed25519",
      keyId: "default",
      value: "sig",
      signedAt: new Date(approvedAt),
    },
  };
}

/**
 * Two approvals with the same approvedAt (the same millisecond): the one
 * inserted later is the most recent, whatever its record id. Finding 10 in
 * finalflowparmana: Postgres used to decide this by the random record id.
 */
describe("approval records with the same approvedAt", () => {
  it("memory: the later-inserted record wins, for the name and for the version", async () => {
    const repository = new MemoryPolicyChangeApprovalRecordRepository();
    const at = "2026-11-15T10:00:00.000Z";

    await repository.create(record("zzz-first", "1.1.0", at));
    await repository.create(record("aaa-second", "1.0.0", at));

    expect(
      (await repository.findMostRecentForName("customer-refund"))
        ?.policyChangeApprovalRecordId,
    ).toBe("aaa-second");
    expect(
      (await repository.findMostRecentFor("customer-refund", "1.1.0"))
        ?.policyChangeApprovalRecordId,
    ).toBe("zzz-first");
  });

  it("postgres: every 'most recent' query orders by approved_at, then insertion order, then the record id", async () => {
    const queries: string[] = [];
    const pool = {
      async query(text: string) {
        queries.push(text.replace(/\s+/g, " "));
        return { rows: [] };
      },
    } as unknown as Pool;
    const repository = new PostgresPolicyChangeApprovalRecordRepository(pool);

    await repository.findMostRecentForName("customer-refund");
    await repository.findMostRecentFor("customer-refund", "1.0.0");
    await repository.findByPendingPolicyChangeId("change-1");
    await repository.list();

    const order =
      "ORDER BY approved_at DESC, approval_sequence DESC NULLS LAST, policy_change_approval_record_id DESC";
    expect(queries).toHaveLength(4);
    for (const text of queries) {
      expect(text).toContain(order);
    }
  });
});
