import { describe, expect, it } from "vitest";

import {
  AuditEventCrypto,
  CallerAuditChainVerifier,
  CryptoBootstrap,
  TrustRecordHasher,
  type ChainedCallerAuditEventRow,
} from "../../src/index.js";

/**
 * CallerAuditChainVerifier proves the per-caller audit chain
 * (SupabaseCallerAuditSink) is actually tamper-evident: a deleted row
 * breaks the previousChainHash linkage for whatever comes after it,
 * and a modified row fails its own recomputed signature/hash. No
 * database, no network -- rows are passed in directly, the same
 * standalone discipline verify-independently.mdx demonstrates for
 * ExecutionTrustRecord.
 */
describe("CallerAuditChainVerifier", () => {
  const crypto = new AuditEventCrypto();
  const hasher = new TrustRecordHasher(CryptoBootstrap.create());

  async function chainedRow(
    event: Record<string, unknown>,
    previousChainHash: string | null,
    chainPosition: number,
  ): Promise<ChainedCallerAuditEventRow> {
    const signedContent = { ...event, previousChainHash, chainPosition };
    const signature = await crypto.sign(signedContent);
    const chainHash = await hasher.hash(signedContent);

    return { event, signature, chainHash, previousChainHash, chainPosition };
  }

  async function buildValidChain(
    callerId: string,
    count: number,
  ): Promise<ChainedCallerAuditEventRow[]> {
    const rows: ChainedCallerAuditEventRow[] = [];
    let previousChainHash: string | null = null;

    for (let i = 0; i < count; i++) {
      const event = {
        type: "caller.authenticated",
        occurredAt: `2026-01-01T00:00:0${i}.000Z`,
        route: "/execute",
        callerId,
      };

      const row = await chainedRow(event, previousChainHash, i + 1);
      rows.push(row);
      previousChainHash = row.chainHash;
    }

    return rows;
  }

  it("verifies an unbroken chain of three events", async () => {
    const rows = await buildValidChain("caller-1", 3);

    const result = await new CallerAuditChainVerifier().verifyChain(rows);

    expect(result).toEqual({ valid: true });
  });

  it("detects a deleted row by the resulting previousChainHash mismatch", async () => {
    const rows = await buildValidChain("caller-1", 3);

    // Simulate deleting the middle row (position 2): the remaining
    // rows are 1 and 3, but row 3's previousChainHash still points at
    // row 2's chainHash, which no longer matches row 1's chainHash.
    const withDeletion = [rows[0]!, rows[2]!];

    const result = await new CallerAuditChainVerifier().verifyChain(
      withDeletion,
    );

    expect(result.valid).toBe(false);
    expect(result.brokenAtPosition).toBe(2);
    expect(result.reason).toContain("previousChainHash");
  });

  it("detects a modified event by its own signature failing to verify", async () => {
    const rows = await buildValidChain("caller-1", 2);

    const tampered: ChainedCallerAuditEventRow = {
      ...rows[1]!,
      event: { ...rows[1]!.event, callerId: "attacker-controlled" },
    };

    const result = await new CallerAuditChainVerifier().verifyChain([
      rows[0]!,
      tampered,
    ]);

    expect(result.valid).toBe(false);
    expect(result.brokenAtPosition).toBe(2);
    expect(result.reason).toContain("signature");
  });

  it("verifies unchained rows (no callerId at write time) on signature alone, with no linkage required", async () => {
    const event = {
      type: "caller.rejected",
      occurredAt: "2026-01-01T00:00:00.000Z",
      route: "/execute",
      reason: "missing credential",
    };

    const signature = await crypto.sign(event);

    const row: ChainedCallerAuditEventRow = {
      event,
      signature,
      chainHash: null,
      previousChainHash: null,
      chainPosition: null,
    };

    const result = await new CallerAuditChainVerifier().verifyChain([row]);

    expect(result).toEqual({ valid: true });
  });

  it("treats an empty chain as valid", async () => {
    const result = await new CallerAuditChainVerifier().verifyChain([]);

    expect(result).toEqual({ valid: true });
  });
});
