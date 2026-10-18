import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FilePolicyRepository } from "@parmana/policy";
import { PolicyChangeCrypto } from "@parmana/crypto";
import type { PolicyChangeApprovalRecord } from "@parmana/shared";
import { MemoryPolicyChangeApprovalRecordRepository } from "@parmana/storage";

import {
  assertPolicyGovernanceIntegrityAtStartup,
  verifyPolicyGovernanceIntegrityAtStartup,
} from "../../src/governance/verifyPolicyGovernanceIntegrityAtStartup.js";

/**
 * Builds a real, correctly-signed PolicyChangeApprovalRecord fixture --
 * this check now verifies the record's own signature (see
 * verifyPolicyGovernanceIntegrityAtStartup.ts's "signature-invalid"
 * mismatch reason), so a fixture with a hand-written placeholder
 * signature (as this file used before that check existed) would fail
 * every test, not exercise the intended scenario.
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

describe("verifyPolicyGovernanceIntegrityAtStartup", () => {
  let scratchDir: string;
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scratchDir = mkdtempSync(
      path.join(tmpdir(), "parmana-governance-integrity-"),
    );
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(scratchDir, { recursive: true, force: true });
    consoleError.mockRestore();
    consoleLog.mockRestore();
  });

  it("reports nothing to check when there are no approval records", async () => {
    const result = await verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository: new FilePolicyRepository(scratchDir),
      policyChangeCrypto: new PolicyChangeCrypto(),
      policyChangeApprovalRecordRepository:
        new MemoryPolicyChangeApprovalRecordRepository(),
    });

    expect(result).toEqual({ checked: 0, mismatches: [] });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("passes when the live file matches the most recent approval record's contentHashAfter", async () => {
    const policyRepository = new FilePolicyRepository(scratchDir);
    const crypto = new PolicyChangeCrypto();
    const approvalRepository = new MemoryPolicyChangeApprovalRecordRepository();

    const content = {
      policyId: "vendor-payment",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [],
    };

    await policyRepository.save("vendor-payment", "1.0.0", content as never);
    const contentHashAfter = await crypto.hashPolicyContent(content);

    await approvalRepository.create(
      await fixtureRecord(crypto, { contentHashAfter }),
    );

    const result = await verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository,
      policyChangeCrypto: crypto,
      policyChangeApprovalRecordRepository: approvalRepository,
    });

    expect(result).toEqual({ checked: 1, mismatches: [] });
    expect(
      consoleLog.mock.calls.some(
        ([entry]) =>
          typeof entry === "object" &&
          entry !== null &&
          (entry as { event?: unknown }).event ===
            "policy_governance_integrity_check_passed",
      ),
    ).toBe(true);
  });

  it("flags a content-mismatch when the live file was edited outside the pending-change API", async () => {
    const policyRepository = new FilePolicyRepository(scratchDir);
    const crypto = new PolicyChangeCrypto();
    const approvalRepository = new MemoryPolicyChangeApprovalRecordRepository();

    const approvedContent = {
      policyId: "vendor-payment",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [],
    };

    const contentHashAfter = await crypto.hashPolicyContent(approvedContent);
    await approvalRepository.create(
      await fixtureRecord(crypto, { contentHashAfter }),
    );

    // The live file on disk was hand-edited after approval, never
    // going back through the pending-change API.
    const tamperedContent = { ...approvedContent, rules: [{ tampered: true }] };
    await policyRepository.save(
      "vendor-payment",
      "1.0.0",
      tamperedContent as never,
    );

    const result = await verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository,
      policyChangeCrypto: crypto,
      policyChangeApprovalRecordRepository: approvalRepository,
    });

    expect(result).toEqual({
      checked: 1,
      mismatches: [
        {
          policyName: "vendor-payment",
          policyVersion: "1.0.0",
          reason: "content-mismatch",
        },
      ],
    });

    expect(
      consoleError.mock.calls.some(
        ([entry]) =>
          typeof entry === "object" &&
          entry !== null &&
          (entry as { event?: unknown }).event ===
            "policy_governance_integrity_mismatch",
      ),
    ).toBe(true);
  });

  it("flags 'missing' when an approved version has no live file at all", async () => {
    const policyRepository = new FilePolicyRepository(scratchDir);
    const crypto = new PolicyChangeCrypto();
    const approvalRepository = new MemoryPolicyChangeApprovalRecordRepository();

    await approvalRepository.create(
      await fixtureRecord(crypto, {
        policyName: "never-written",
        policyVersion: "1.0.0",
      }),
    );

    const result = await verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository,
      policyChangeCrypto: crypto,
      policyChangeApprovalRecordRepository: approvalRepository,
    });

    expect(result).toEqual({
      checked: 1,
      mismatches: [
        {
          policyName: "never-written",
          policyVersion: "1.0.0",
          reason: "missing",
        },
      ],
    });
  });

  it("flags 'signature-invalid' when the most recent approval record's signature does not verify", async () => {
    const policyRepository = new FilePolicyRepository(scratchDir);
    const crypto = new PolicyChangeCrypto();
    const approvalRepository = new MemoryPolicyChangeApprovalRecordRepository();

    const content = {
      policyId: "vendor-payment",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [],
    };

    await policyRepository.save("vendor-payment", "1.0.0", content as never);
    const contentHashAfter = await crypto.hashPolicyContent(content);

    const record = await fixtureRecord(crypto, { contentHashAfter });

    // The record was signed correctly, but its stored approvedBy was
    // altered after the fact -- exactly the tamper this check exists
    // to catch, distinct from a content-mismatch on the live file.
    await approvalRepository.create({ ...record, approvedBy: "someone-else" });

    const result = await verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository,
      policyChangeCrypto: crypto,
      policyChangeApprovalRecordRepository: approvalRepository,
    });

    expect(result).toEqual({
      checked: 1,
      mismatches: [
        {
          policyName: "vendor-payment",
          policyVersion: "1.0.0",
          reason: "signature-invalid",
        },
      ],
    });
  });

  it("flags 'chain-broken' when a record's previousRecordHash does not match the record before it", async () => {
    const policyRepository = new FilePolicyRepository(scratchDir);
    const crypto = new PolicyChangeCrypto();
    const approvalRepository = new MemoryPolicyChangeApprovalRecordRepository();

    const content = {
      policyId: "vendor-payment",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [{ id: "v2" }],
    };

    await policyRepository.save("vendor-payment", "1.0.0", content as never);

    const oldRecord = await fixtureRecord(crypto, {
      policyChangeApprovalRecordId: "pcar-old",
      approvedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    await approvalRepository.create(oldRecord);

    // previousRecordHash points at nothing real -- as if the true
    // prior record had been deleted or substituted in the store.
    const newRecord = await fixtureRecord(crypto, {
      policyChangeApprovalRecordId: "pcar-new",
      approvedAt: new Date("2026-08-02T00:00:00.000Z"),
      contentHashAfter: await crypto.hashPolicyContent(content),
      previousRecordHash: "sha256-of-a-record-that-was-never-actually-prior",
    });
    await approvalRepository.create(newRecord);

    const result = await verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository,
      policyChangeCrypto: crypto,
      policyChangeApprovalRecordRepository: approvalRepository,
    });

    expect(result.mismatches).toContainEqual({
      policyName: "vendor-payment",
      policyVersion: "1.0.0",
      reason: "chain-broken",
    });
  });

  it("checks a re-approved version exactly once, against the MOST RECENT record, with a correctly chained history", async () => {
    const policyRepository = new FilePolicyRepository(scratchDir);
    const crypto = new PolicyChangeCrypto();
    const approvalRepository = new MemoryPolicyChangeApprovalRecordRepository();

    const firstContent = {
      policyId: "vendor-payment",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [{ id: "v1" }],
    };
    const secondContent = {
      policyId: "vendor-payment",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [{ id: "v2" }],
    };

    // An older approval record for the same (name, version), an
    // in-place patch superseded by the second approval below.
    const oldRecord = await fixtureRecord(crypto, {
      policyChangeApprovalRecordId: "pcar-old",
      approvedAt: new Date("2026-08-01T00:00:00.000Z"),
      contentHashAfter: await crypto.hashPolicyContent(firstContent),
    });
    await approvalRepository.create(oldRecord);

    await approvalRepository.create(
      await fixtureRecord(crypto, {
        policyChangeApprovalRecordId: "pcar-new",
        approvedAt: new Date("2026-08-02T00:00:00.000Z"),
        contentHashAfter: await crypto.hashPolicyContent(secondContent),
        previousRecordHash: await crypto.hashPolicyContent(oldRecord),
      }),
    );

    // The live file matches the SECOND (most recent) approval only.
    await policyRepository.save(
      "vendor-payment",
      "1.0.0",
      secondContent as never,
    );

    const result = await verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository,
      policyChangeCrypto: crypto,
      policyChangeApprovalRecordRepository: approvalRepository,
    });

    // Exactly one (policyName, policyVersion) pair, checked once, and
    // it passes because the check correctly used the most recent
    // record's contentHashAfter, not the older superseded one, and
    // the chain between the two records is intact.
    expect(result).toEqual({ checked: 1, mismatches: [] });
  });

  it("never throws, and logs rather than crashes, when the repository itself is unavailable", async () => {
    const policyRepository = new FilePolicyRepository(scratchDir);
    const crypto = new PolicyChangeCrypto();

    const brokenRepository = {
      create: async () => {
        throw new Error("not used");
      },
      findById: async () => null,
      list: async () => {
        throw new Error("storage unavailable");
      },
      findMostRecentFor: async () => null,
    };

    const result = await verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository,
      policyChangeCrypto: crypto,
      policyChangeApprovalRecordRepository: brokenRepository,
    });

    expect(result).toEqual({ checked: 0, mismatches: [] });
    expect(
      consoleError.mock.calls.some(
        ([entry]) =>
          typeof entry === "object" &&
          entry !== null &&
          (entry as { event?: unknown }).event ===
            "policy_governance_integrity_check_unavailable",
      ),
    ).toBe(true);
  });

  it("checking multiple distinct pairs isolates a failure in one from the rest", async () => {
    const policyRepository = new FilePolicyRepository(scratchDir);
    const crypto = new PolicyChangeCrypto();
    const approvalRepository = new MemoryPolicyChangeApprovalRecordRepository();

    const goodContent = {
      policyId: "policy-a",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [],
    };

    await policyRepository.save("policy-a", "1.0.0", goodContent as never);
    await approvalRepository.create(
      await fixtureRecord(crypto, {
        policyName: "policy-a",
        policyVersion: "1.0.0",
        contentHashAfter: await crypto.hashPolicyContent(goodContent),
      }),
    );

    // policy-b has an approval record but was never written -- a
    // "missing" mismatch that must not stop policy-a from being
    // correctly reported as passing.
    await approvalRepository.create(
      await fixtureRecord(crypto, {
        policyName: "policy-b",
        policyVersion: "1.0.0",
      }),
    );

    const result = await verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository,
      policyChangeCrypto: crypto,
      policyChangeApprovalRecordRepository: approvalRepository,
    });

    expect(result.checked).toBe(2);
    expect(result.mismatches).toEqual([
      { policyName: "policy-b", policyVersion: "1.0.0", reason: "missing" },
    ]);
  });

  describe("assertPolicyGovernanceIntegrityAtStartup (blocks startup)", () => {
    it("resolves when there is nothing to check", async () => {
      await expect(
        assertPolicyGovernanceIntegrityAtStartup({
          policyRepository: new FilePolicyRepository(scratchDir),
          policyChangeCrypto: new PolicyChangeCrypto(),
          policyChangeApprovalRecordRepository:
            new MemoryPolicyChangeApprovalRecordRepository(),
        }),
      ).resolves.toBeUndefined();
    });

    it("rejects when an approved policy has no live file", async () => {
      const crypto = new PolicyChangeCrypto();
      const approvalRepository =
        new MemoryPolicyChangeApprovalRecordRepository();

      await approvalRepository.create(
        await fixtureRecord(crypto, {
          policyName: "never-written",
          policyVersion: "1.0.0",
        }),
      );

      await expect(
        assertPolicyGovernanceIntegrityAtStartup({
          policyRepository: new FilePolicyRepository(scratchDir),
          policyChangeCrypto: crypto,
          policyChangeApprovalRecordRepository: approvalRepository,
        }),
      ).rejects.toThrow(/will not start: never-written@1\.0\.0 \(missing\)/);
    });

    it("rejects, rather than passing, when the approval records cannot be listed", async () => {
      const brokenRepository = {
        create: async () => {
          throw new Error("not used");
        },
        findById: async () => null,
        list: async () => {
          throw new Error("storage unavailable");
        },
        findMostRecentFor: async () => null,
      };

      await expect(
        assertPolicyGovernanceIntegrityAtStartup({
          policyRepository: new FilePolicyRepository(scratchDir),
          policyChangeCrypto: new PolicyChangeCrypto(),
          policyChangeApprovalRecordRepository: brokenRepository,
        }),
      ).rejects.toThrow(/could not run/);
    });
  });
});
