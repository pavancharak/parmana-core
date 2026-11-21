import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ExecutionTrustRecord } from "@parmana/shared";

import { verifyExecutionTrustRecordOffline } from "../../src/OfflineVerifier.js";
import {
  canonicalExecutionTrustRecord,
  hybridSignedCanonicalView,
} from "../../src/ExecutionTrustRecordCanonicalView.js";
import { TrustRecordHasher } from "../../src/TrustRecordHasher.js";
import { SHA256HashProvider } from "../../src/providers/hash/SHA256HashProvider.js";
import { Ed25519SignatureProvider } from "../../src/providers/signature/Ed25519SignatureProvider.js";
import { ArtifactSigner } from "../../src/ArtifactSigner.js";

/**
 * ADR-0016 option 2, offline side, under decision D24: a schema version 3 record with one signature
 * (single mode) is accepted before the cutover, and refused from the cutover on, where both hybrid
 * signatures are required. There is no legacy-only record.
 */

const CREATED_AT = "2026-06-01T00:00:00.000Z";
const CUTOVER = "2026-03-01T00:00:00.000Z";

async function buildSingleRecord(
  createdAt: string,
  keyId: string,
  privateKey: ReturnType<typeof generateKeyPairSync<"ed25519">>["privateKey"],
): Promise<ExecutionTrustRecord> {
  const draft = {
    trustRecordId: "txn-cutover",
    businessTransactionId: "txn-cutover",
    transaction: { businessTransactionId: "txn-cutover", status: "RECEIVED" },
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
    hybridSignedCanonicalView(withHash, 3),
    privateKey,
  );

  return {
    ...withHash,
    schemaVersion: 3,
    signatures: [{ algorithm: "ed25519", keyId, signature: value }],
  } as ExecutionTrustRecord;
}

describe("offline verifier: hybridRequiredFrom cutover (schema version 3)", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const keys = {
    "cutover-key": publicKey.export({ format: "pem", type: "spki" }).toString(),
  };

  it("accepts a single-signed record created before the cutover", async () => {
    const record = await buildSingleRecord(
      "2026-01-01T00:00:00.000Z",
      "cutover-key",
      privateKey,
    );

    const result = await verifyExecutionTrustRecordOffline(record, keys, {
      hybridRequiredFrom: CUTOVER,
    });

    expect(result.valid).toBe(true);
  });

  it("refuses a single-signed record created after the cutover: both hybrid signatures are required", async () => {
    const record = await buildSingleRecord(
      CREATED_AT,
      "cutover-key",
      privateKey,
    );

    const result = await verifyExecutionTrustRecordOffline(record, keys, {
      hybridRequiredFrom: CUTOVER,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/hybridRequiredFrom/);
  });

  it("treats the cutover instant as inclusive", async () => {
    const record = await buildSingleRecord(
      CREATED_AT,
      "cutover-key",
      privateKey,
    );

    const result = await verifyExecutionTrustRecordOffline(record, keys, {
      hybridRequiredFrom: CREATED_AT,
    });

    expect(result.valid).toBe(false);
  });

  it("accepts a single-signed record when no cutover is given (single mode)", async () => {
    const record = await buildSingleRecord(
      CREATED_AT,
      "cutover-key",
      privateKey,
    );

    const result = await verifyExecutionTrustRecordOffline(record, keys);

    expect(result.valid).toBe(true);
  });
});
