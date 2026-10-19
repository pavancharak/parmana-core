import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ExecutionTrustRecord } from "@parmana/shared";

import { verifyExecutionTrustRecordOffline } from "../../src/OfflineVerifier.js";
import { canonicalExecutionTrustRecord } from "../../src/ExecutionTrustRecordCanonicalView.js";
import { TrustRecordHasher } from "../../src/TrustRecordHasher.js";
import { SHA256HashProvider } from "../../src/providers/hash/SHA256HashProvider.js";
import { Ed25519SignatureProvider } from "../../src/providers/signature/Ed25519SignatureProvider.js";
import { ArtifactSigner } from "../../src/ArtifactSigner.js";

/**
 * ADR-0016 option 2, offline side: a record created at or after the cutover
 * must carry a hybrid envelope. These records are legacy-only (Ed25519), so
 * they run on any Node version.
 */

const CREATED_AT = "2026-06-01T00:00:00.000Z";

async function buildLegacyRecord(
  createdAt: string,
  keyId: string,
  privateKey: ReturnType<typeof generateKeyPairSync<"ed25519">>["privateKey"],
): Promise<ExecutionTrustRecord> {
  const draft = {
    trustRecordId: "txn-cutover",
    businessTransactionId: "txn-cutover",
    transaction: { businessTransactionId: "txn-cutover", status: "RECEIVED" },
    overrides: [],
    executions: [],
    verifications: [],
    receipts: [],
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  } as unknown as ExecutionTrustRecord;

  const hasher = new TrustRecordHasher({
    hash: new SHA256HashProvider(),
    signature: new Ed25519SignatureProvider(),
  });

  const trustRecordHash = await hasher.hash(
    canonicalExecutionTrustRecord(draft),
  );
  const withHash = { ...draft, trustRecordHash } as ExecutionTrustRecord;

  const signer = new ArtifactSigner({
    hash: new SHA256HashProvider(),
    signature: new Ed25519SignatureProvider(),
  });

  const value = await signer.sign(
    canonicalExecutionTrustRecord(withHash),
    privateKey,
  );

  return {
    ...withHash,
    signature: {
      algorithm: "ed25519",
      keyId,
      value,
      signedAt: new Date(createdAt),
    },
  } as ExecutionTrustRecord;
}

describe("offline verifier: hybridRequiredFrom cutover", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const keys = {
    "cutover-key": publicKey.export({ format: "pem", type: "spki" }).toString(),
  };

  it("accepts a legacy-only record created before the cutover", async () => {
    const record = await buildLegacyRecord(
      "2026-01-01T00:00:00.000Z",
      "cutover-key",
      privateKey,
    );

    const result = await verifyExecutionTrustRecordOffline(record, keys, {
      hybridRequiredFrom: "2026-03-01T00:00:00.000Z",
    });

    expect(result.valid).toBe(true);
  });

  it("rejects a legacy-only record created after the cutover", async () => {
    const record = await buildLegacyRecord(
      CREATED_AT,
      "cutover-key",
      privateKey,
    );

    const result = await verifyExecutionTrustRecordOffline(record, keys, {
      hybridRequiredFrom: "2026-03-01T00:00:00.000Z",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/hybridRequiredFrom/);
  });

  it("treats the cutover instant as inclusive", async () => {
    const record = await buildLegacyRecord(
      CREATED_AT,
      "cutover-key",
      privateKey,
    );

    const result = await verifyExecutionTrustRecordOffline(record, keys, {
      hybridRequiredFrom: CREATED_AT,
    });

    expect(result.valid).toBe(false);
  });

  it("does not apply a cutover when none is given", async () => {
    const record = await buildLegacyRecord(
      CREATED_AT,
      "cutover-key",
      privateKey,
    );

    const result = await verifyExecutionTrustRecordOffline(record, keys);

    expect(result.valid).toBe(true);
  });
});
