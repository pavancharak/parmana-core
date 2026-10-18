import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { PolicyChangeCrypto } from "@parmana/crypto";
import type { PolicyChangeApprovalRecord } from "@parmana/shared";
import { MemoryPolicyChangeApprovalRecordRepository } from "@parmana/storage";

import type { ApprovalLookup } from "../verify-policy-changes-approved.js";
import { verifyPolicyChangesApproved } from "../verify-policy-changes-approved.js";

const POLICIES_DIR = path.resolve("policies");

function policyFilePath(name: string, version: string): string {
  return path.join(POLICIES_DIR, name, version, "policy.json");
}

/**
 * Wraps the real MemoryPolicyChangeApprovalRecordRepository (the same
 * class the approve route persists through in production) as an
 * ApprovalLookup -- these tests exercise real signing/hashing and a
 * real repository, not hand-typed fake hash strings, for the
 * "went through the real governance flow" case specifically.
 */
function lookupFrom(
  repository: MemoryPolicyChangeApprovalRecordRepository,
): ApprovalLookup {
  return {
    async findMostRecentApproval(policyName, policyVersion) {
      const record = await repository.findMostRecentFor(
        policyName,
        policyVersion,
      );

      return record === null
        ? null
        : { contentHashAfter: record.contentHashAfter };
    },
  };
}

function fixtureRecord(
  overrides: Partial<PolicyChangeApprovalRecord>,
): PolicyChangeApprovalRecord {
  return {
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
    signature: {
      algorithm: "ed25519",
      keyId: "default",
      value: "placeholder",
      signedAt: new Date("2026-08-01T00:05:00.000Z"),
    },
    ...overrides,
  };
}

describe("verifyPolicyChangesApproved", () => {
  const files: Record<string, string> = {};

  afterEach(() => {
    for (const key of Object.keys(files)) delete files[key];
  });

  function fakeReadPolicyFile(filePath: string): Promise<string> {
    if (!(filePath in files)) {
      throw new Error(`no fixture content registered for ${filePath}`);
    }

    return Promise.resolve(files[filePath]);
  }

  it("passes a policy change that went through the real governance approval flow", async () => {
    const crypto = new PolicyChangeCrypto();
    const repository = new MemoryPolicyChangeApprovalRecordRepository();

    const approvedContent = {
      policyId: "vendor-payment",
      policyVersion: "2.0.0",
      schemaVersion: "1.0.0",
      rules: [],
    };

    const contentHashAfter = await crypto.hashPolicyContent(approvedContent);
    await repository.create(
      fixtureRecord({
        policyName: "vendor-payment",
        policyVersion: "2.0.0",
        contentHashAfter,
      }),
    );

    const filePath = policyFilePath("vendor-payment", "2.0.0");
    files[filePath] = JSON.stringify(approvedContent);

    const result = await verifyPolicyChangesApproved([filePath], {
      policiesDir: POLICIES_DIR,
      approvalLookup: lookupFrom(repository),
      readPolicyFile: fakeReadPolicyFile,
    });

    expect(result).toEqual({ ok: true, checked: 1 });
  });

  it("fails a direct, unapproved edit with a clear error naming the file", async () => {
    const repository = new MemoryPolicyChangeApprovalRecordRepository();
    // No approval record exists at all for this (name, version).

    const filePath = policyFilePath("vendor-payment", "9.9.9");
    files[filePath] = JSON.stringify({
      policyId: "vendor-payment",
      policyVersion: "9.9.9",
      schemaVersion: "1.0.0",
      rules: [],
    });

    const result = await verifyPolicyChangesApproved([filePath], {
      policiesDir: POLICIES_DIR,
      approvalLookup: lookupFrom(repository),
      readPolicyFile: fakeReadPolicyFile,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("unapproved-files");
    expect(result.unapprovedFiles).toEqual([
      {
        filePath,
        policyName: "vendor-payment",
        policyVersion: "9.9.9",
        reason: "no-approval-record",
      },
    ]);
    expect(result.message).toContain("1 changed");
  });

  it("fails a file whose live content no longer matches its approved hash", async () => {
    const crypto = new PolicyChangeCrypto();
    const repository = new MemoryPolicyChangeApprovalRecordRepository();

    const approvedContent = {
      policyId: "vendor-payment",
      policyVersion: "3.0.0",
      schemaVersion: "1.0.0",
      rules: [],
    };

    await repository.create(
      fixtureRecord({
        policyName: "vendor-payment",
        policyVersion: "3.0.0",
        contentHashAfter: await crypto.hashPolicyContent(approvedContent),
      }),
    );

    // The live file was hand-edited after approval, outside the API.
    const tamperedContent = { ...approvedContent, rules: [{ tampered: true }] };
    const filePath = policyFilePath("vendor-payment", "3.0.0");
    files[filePath] = JSON.stringify(tamperedContent);

    const result = await verifyPolicyChangesApproved([filePath], {
      policiesDir: POLICIES_DIR,
      approvalLookup: lookupFrom(repository),
      readPolicyFile: fakeReadPolicyFile,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.unapprovedFiles).toEqual([
      {
        filePath,
        policyName: "vendor-payment",
        policyVersion: "3.0.0",
        reason: "content-hash-mismatch",
      },
    ]);
  });

  it("reports every unapproved file among several changed files, not just the first", async () => {
    const crypto = new PolicyChangeCrypto();
    const repository = new MemoryPolicyChangeApprovalRecordRepository();

    const approvedContent = {
      policyId: "policy-a",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [],
    };
    await repository.create(
      fixtureRecord({
        policyName: "policy-a",
        policyVersion: "1.0.0",
        contentHashAfter: await crypto.hashPolicyContent(approvedContent),
      }),
    );

    const approvedPath = policyFilePath("policy-a", "1.0.0");
    const missingRecordPath = policyFilePath("policy-b", "1.0.0");
    const mismatchedContent = {
      policyId: "policy-c",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [],
    };
    await repository.create(
      fixtureRecord({
        policyName: "policy-c",
        policyVersion: "1.0.0",
        contentHashAfter: "sha256-of-something-else-entirely",
      }),
    );
    const mismatchedPath = policyFilePath("policy-c", "1.0.0");

    files[approvedPath] = JSON.stringify(approvedContent);
    files[missingRecordPath] = JSON.stringify({
      policyId: "policy-b",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [],
    });
    files[mismatchedPath] = JSON.stringify(mismatchedContent);

    const result = await verifyPolicyChangesApproved(
      [approvedPath, missingRecordPath, mismatchedPath],
      {
        policiesDir: POLICIES_DIR,
        approvalLookup: lookupFrom(repository),
        readPolicyFile: fakeReadPolicyFile,
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.unapprovedFiles).toHaveLength(2);
    expect(result.unapprovedFiles?.map((f) => f.filePath).sort()).toEqual(
      [missingRecordPath, mismatchedPath].sort(),
    );
    expect(
      result.unapprovedFiles?.find((f) => f.filePath === missingRecordPath)
        ?.reason,
    ).toBe("no-approval-record");
    expect(
      result.unapprovedFiles?.find((f) => f.filePath === mismatchedPath)
        ?.reason,
    ).toBe("content-hash-mismatch");
  });

  it("fails CLOSED (blocks) when the approval lookup is unreachable, distinct from an unapproved finding", async () => {
    const filePath = policyFilePath("vendor-payment", "4.0.0");
    files[filePath] = JSON.stringify({
      policyId: "vendor-payment",
      policyVersion: "4.0.0",
      schemaVersion: "1.0.0",
      rules: [],
    });

    const unreachableLookup: ApprovalLookup = {
      findMostRecentApproval() {
        return Promise.reject(new Error("ECONNREFUSED: Supabase unreachable"));
      },
    };

    const result = await verifyPolicyChangesApproved([filePath], {
      policiesDir: POLICIES_DIR,
      approvalLookup: unreachableLookup,
      readPolicyFile: fakeReadPolicyFile,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // Distinct reason from "unapproved-files" -- a caller must be able
    // to tell "couldn't check" apart from "checked, found a problem."
    expect(result.reason).toBe("verification-unavailable");
    expect(result.unapprovedFiles).toBeUndefined();
    expect(result.message).toContain("Supabase unreachable");
  });

  it("fails CLOSED for the whole run if any one of several lookups is unreachable, not just a partial result", async () => {
    const crypto = new PolicyChangeCrypto();
    const repository = new MemoryPolicyChangeApprovalRecordRepository();

    const approvedContent = {
      policyId: "policy-a",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [],
    };
    await repository.create(
      fixtureRecord({
        policyName: "policy-a",
        policyVersion: "1.0.0",
        contentHashAfter: await crypto.hashPolicyContent(approvedContent),
      }),
    );

    const approvedPath = policyFilePath("policy-a", "1.0.0");
    const unreachablePath = policyFilePath("policy-unreachable", "1.0.0");

    files[approvedPath] = JSON.stringify(approvedContent);
    files[unreachablePath] = JSON.stringify({
      policyId: "policy-unreachable",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [],
    });

    const realLookup = lookupFrom(repository);
    const flakyLookup: ApprovalLookup = {
      async findMostRecentApproval(policyName, policyVersion) {
        if (policyName === "policy-unreachable") {
          throw new Error("ECONNREFUSED");
        }

        return realLookup.findMostRecentApproval(policyName, policyVersion);
      },
    };

    const result = await verifyPolicyChangesApproved(
      [approvedPath, unreachablePath],
      {
        policiesDir: POLICIES_DIR,
        approvalLookup: flakyLookup,
        readPolicyFile: fakeReadPolicyFile,
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("verification-unavailable");
  });

  it("rejects a file path that doesn't look like policies/{name}/{version}/policy.json", async () => {
    const repository = new MemoryPolicyChangeApprovalRecordRepository();
    const malformedPath = path.join(POLICIES_DIR, "not-a-policy-file.json");

    await expect(
      verifyPolicyChangesApproved([malformedPath], {
        policiesDir: POLICIES_DIR,
        approvalLookup: lookupFrom(repository),
        readPolicyFile: fakeReadPolicyFile,
      }),
    ).rejects.toThrow(
      "does not look like a policies/{name}/{version}/policy.json path",
    );
  });
});
