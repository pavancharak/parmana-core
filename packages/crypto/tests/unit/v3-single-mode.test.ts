import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VerificationCrypto } from "../../src/VerificationCrypto.js";
import type { ExecutionTrustRecord } from "@parmana/shared";

// Schema version 3 in single mode (decision D24): one signature, for the configured primary
// algorithm, over the whole record. Schema version 2 is not accepted at all.
async function singleRecord(
  crypto: VerificationCrypto,
): Promise<ExecutionTrustRecord> {
  const now = new Date("2026-11-21T00:00:00Z");
  const draft = {
    trustRecordId: "trust-single-v3",
    businessTransactionId: "txn-single-v3",
    transaction: { businessTransactionId: "txn-single-v3" },
    overrides: [],
    executions: [],
    verifications: [],
    receipts: [],
    createdAt: now,
    updatedAt: now,
    trustRecordHash: "",
    signature: {
      algorithm: "ed25519" as const,
      keyId: "default",
      value: "",
      signedAt: now,
    },
  } as unknown as ExecutionTrustRecord;

  const trustRecordHash = await crypto.hash(draft);
  const withHash = { ...draft, trustRecordHash } as ExecutionTrustRecord;
  const signature = await crypto.sign(withHash);
  const signatures = await crypto.signWholeRecord({ ...withHash, signature });

  return {
    ...withHash,
    signature,
    schemaVersion: 3,
    signatures,
  } as ExecutionTrustRecord;
}

describe("schema version 3, single mode (D24)", () => {
  beforeEach(() => {
    vi.stubEnv("CRYPTO_MODE", "single");
    vi.stubEnv("PRIMARY_SIGNATURE_PROVIDER", "ed25519");
    vi.stubEnv("SECONDARY_SIGNATURE_PROVIDER", "");
    vi.stubEnv("HYBRID_SCHEMA_VERSION", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies a single-signed version 3 record", async () => {
    const crypto = new VerificationCrypto();
    const record = await singleRecord(crypto);
    expect(record.signatures).toHaveLength(1);
    expect(record.signatures?.[0]?.algorithm).toBe("ed25519");
    await expect(crypto.verify(record)).resolves.toBe(true);
  });

  it("refuses a record whose version was changed to 2 (the downgrade this closes)", async () => {
    const crypto = new VerificationCrypto();
    const record = await singleRecord(crypto);
    await expect(
      crypto.verify({ ...record, schemaVersion: 2 } as ExecutionTrustRecord),
    ).resolves.toBe(false);
  });

  it("refuses a record with a changed field, because the signature covers the whole record", async () => {
    const crypto = new VerificationCrypto();
    const record = await singleRecord(crypto);
    await expect(
      crypto.verify({
        ...record,
        businessTransactionId: "txn-altered",
      } as ExecutionTrustRecord),
    ).resolves.toBe(false);
  });

  it("refuses a single-mode record with two signature entries", async () => {
    const crypto = new VerificationCrypto();
    const record = await singleRecord(crypto);
    const [entry] = record.signatures ?? [];
    await expect(
      crypto.verify({
        ...record,
        signatures: [entry!, entry!],
      } as ExecutionTrustRecord),
    ).resolves.toBe(false);
  });

  it("refuses a record with no signatures array", async () => {
    const crypto = new VerificationCrypto();
    const record = await singleRecord(crypto);
    const { signatures: _s, ...stripped } = record;
    await expect(crypto.verify(stripped as ExecutionTrustRecord)).resolves.toBe(
      false,
    );
  });
});
