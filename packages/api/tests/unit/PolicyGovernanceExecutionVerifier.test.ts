import { describe, expect, it } from "vitest";

import { PolicyChangeCrypto } from "@parmana/crypto";
import type { PolicyChangeApprovalRecord } from "@parmana/shared";
import { MemoryPolicyChangeApprovalRecordRepository } from "@parmana/storage";

import { PolicyGovernanceExecutionVerifier } from "../../src/governance/PolicyGovernanceExecutionVerifier.js";

/**
 * Builds a real, correctly-signed PolicyChangeApprovalRecord fixture --
 * same reasoning as verifyPolicyGovernanceIntegrityAtStartup.test.ts's
 * own fixtureRecord: this verifier checks the record's actual
 * signature, so a hand-written placeholder signature would fail every
 * case, not exercise the intended scenario.
 */
async function fixtureRecord(
  crypto: PolicyChangeCrypto,
  overrides: Partial<Omit<PolicyChangeApprovalRecord, "signature">> = {},
): Promise<PolicyChangeApprovalRecord> {
  const draft: Omit<PolicyChangeApprovalRecord, "signature"> = {
    policyChangeApprovalRecordId: `pcar-${Math.random()}`,
    // One approval record per pending change, as the repositories enforce.
    pendingPolicyChangeId: `ppc-${Math.random()}`,
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

describe("PolicyGovernanceExecutionVerifier", () => {
  it("returns a violation when no approval record exists for the policy", async () => {
    const verifier = new PolicyGovernanceExecutionVerifier(
      new MemoryPolicyChangeApprovalRecordRepository(),
      new PolicyChangeCrypto(),
    );

    const violation = await verifier.verify(
      "never-approved",
      "1.0.0",
      "hash123",
    );

    expect(violation?.reason).toContain("has no PolicyChangeApprovalRecord");
  });

  it("returns a violation when the approval record's signature does not verify", async () => {
    const crypto = new PolicyChangeCrypto();
    const repository = new MemoryPolicyChangeApprovalRecordRepository();

    const record = await fixtureRecord(crypto, { contentHashAfter: "hash123" });

    // Tampered after signing -- exactly what this check exists to catch.
    await repository.create({ ...record, approvedBy: "someone-else" });

    const verifier = new PolicyGovernanceExecutionVerifier(repository, crypto);

    const violation = await verifier.verify(
      "vendor-payment",
      "1.0.0",
      "hash123",
    );

    expect(violation?.reason).toContain("signature does not verify");
  });

  it("returns a violation when live content does not match the approval record's contentHashAfter", async () => {
    const crypto = new PolicyChangeCrypto();
    const repository = new MemoryPolicyChangeApprovalRecordRepository();

    await repository.create(
      await fixtureRecord(crypto, { contentHashAfter: "approved-hash" }),
    );

    const verifier = new PolicyGovernanceExecutionVerifier(repository, crypto);

    const violation = await verifier.verify(
      "vendor-payment",
      "1.0.0",
      "different-live-hash",
    );

    expect(violation?.reason).toContain(
      "does not match its most recent approval record",
    );
  });

  it("returns undefined (clean) when the record exists, verifies, and content matches", async () => {
    const crypto = new PolicyChangeCrypto();
    const repository = new MemoryPolicyChangeApprovalRecordRepository();

    await repository.create(
      await fixtureRecord(crypto, { contentHashAfter: "matching-hash" }),
    );

    const verifier = new PolicyGovernanceExecutionVerifier(repository, crypto);

    const violation = await verifier.verify(
      "vendor-payment",
      "1.0.0",
      "matching-hash",
    );

    expect(violation).toBeUndefined();
  });

  describe("an older approved version is superseded by a newer approval (G-74)", () => {
    async function approvals(
      ...versions: ReadonlyArray<{ version: string; approvedAt: string }>
    ) {
      const crypto = new PolicyChangeCrypto();
      const repository = new MemoryPolicyChangeApprovalRecordRepository();

      for (const { version, approvedAt } of versions) {
        await repository.create(
          await fixtureRecord(crypto, {
            policyVersion: version,
            approvedAt: new Date(approvedAt),
            contentHashAfter: `hash-${version}`,
          }),
        );
      }

      return new PolicyGovernanceExecutionVerifier(repository, crypto);
    }

    it("refuses the older version and names the version in effect", async () => {
      const verifier = await approvals(
        { version: "1.0.0", approvedAt: "2026-08-01T00:05:00.000Z" },
        { version: "1.1.0", approvedAt: "2026-09-01T00:05:00.000Z" },
      );

      expect(
        await verifier.verify("vendor-payment", "1.1.0", "hash-1.1.0"),
      ).toBeUndefined();

      const violation = await verifier.verify(
        "vendor-payment",
        "1.0.0",
        "hash-1.0.0",
      );

      expect(violation?.reason).toContain("was superseded");
      expect(violation?.reason).toContain('the version in effect is "1.1.0"');
    });

    it("approving the older version again makes it current (a rollback)", async () => {
      const verifier = await approvals(
        { version: "1.0.0", approvedAt: "2026-08-01T00:05:00.000Z" },
        { version: "1.1.0", approvedAt: "2026-09-01T00:05:00.000Z" },
        { version: "1.0.0", approvedAt: "2026-09-02T00:05:00.000Z" },
      );

      expect(
        await verifier.verify("vendor-payment", "1.0.0", "hash-1.0.0"),
      ).toBeUndefined();
      expect(
        (await verifier.verify("vendor-payment", "1.1.0", "hash-1.1.0"))
          ?.reason,
      ).toContain("was superseded");
    });
  });
});
