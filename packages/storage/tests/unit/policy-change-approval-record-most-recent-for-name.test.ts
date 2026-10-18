import { describe, expect, it } from "vitest";

import type { Pool } from "pg";

import type { PolicyChangeApprovalRecord } from "@parmana/shared";

import { MemoryPolicyChangeApprovalRecordRepository } from "../../src/memory/MemoryPolicyChangeApprovalRecordRepository.js";
import { SupabasePolicyChangeApprovalRecordRepository } from "../../src/supabase/SupabasePolicyChangeApprovalRecordRepository.js";

function record(
  id: string,
  policyName: string,
  policyVersion: string,
  approvedAt: string,
): PolicyChangeApprovalRecord {
  return {
    policyChangeApprovalRecordId: id,
    pendingPolicyChangeId: `change-${id}`,
    policyName,
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
 * findMostRecentForName (G-66): the version in effect for a policy name
 * is the one with the latest approval, across versions.
 */
describe("findMostRecentForName", () => {
  it("memory: returns the latest approval across versions, rolls back when an older version is approved again, and ignores other names", async () => {
    const repository = new MemoryPolicyChangeApprovalRecordRepository();

    expect(await repository.findMostRecentForName("customer-refund")).toBe(
      null,
    );

    await repository.create(
      record("a", "customer-refund", "1.0.0", "2026-09-01T00:00:00Z"),
    );
    await repository.create(
      record("b", "customer-refund", "1.1.0", "2026-09-02T00:00:00Z"),
    );
    await repository.create(
      record("c", "slack-post-message", "9.0.0", "2026-09-03T00:00:00Z"),
    );

    expect(
      (await repository.findMostRecentForName("customer-refund"))
        ?.policyVersion,
    ).toBe("1.1.0");

    await repository.create(
      record("d", "customer-refund", "1.0.0", "2026-09-04T00:00:00Z"),
    );

    expect(
      (await repository.findMostRecentForName("customer-refund"))
        ?.policyVersion,
    ).toBe("1.0.0");
  });

  it("postgres: filters by name only and orders by approval time, newest first", async () => {
    const queries: { text: string; values: unknown[] }[] = [];
    const pool = {
      async query(text: string, values: unknown[]) {
        queries.push({ text, values });
        return { rows: [] };
      },
    } as unknown as Pool;

    const repository = new SupabasePolicyChangeApprovalRecordRepository(pool);

    expect(await repository.findMostRecentForName("customer-refund")).toBe(
      null,
    );

    const sql = queries[0].text.replace(/\s+/g, " ");
    expect(queries[0].values).toEqual(["customer-refund"]);
    expect(sql).toContain("WHERE policy_name = $1 ORDER BY approved_at DESC");
    expect(sql).not.toContain("policy_version =");
    expect(sql).toContain("LIMIT 1");
  });
});
