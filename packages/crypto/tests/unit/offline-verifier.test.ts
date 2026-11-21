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
import { Dilithium3SignatureProvider } from "../../src/providers/signature/Dilithium3SignatureProvider.js";
import { ArtifactSigner } from "../../src/ArtifactSigner.js";
import {
  isMlDsa65Supported,
  ML_DSA_65_SKIP_REASON,
} from "../../src/support/MlDsaSupport.js";

/**
 * PQC audit RED-1 (docs/internal/VERIFICATION-GAPS.md): proves offline
 * verification actually works with zero network/disk/env dependency
 * -- every key here is generated in-memory and passed directly as a
 * PEM string, exactly as an external auditor holding only a signed
 * artifact and a published public key would do.
 */
function draftRecord(
  businessTransactionId: string,
): Omit<ExecutionTrustRecord, "trustRecordHash" | "signature"> {
  return {
    trustRecordId: businessTransactionId,
    businessTransactionId,
    transaction: {
      businessTransactionId,
      status: "RECEIVED",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    } as ExecutionTrustRecord["transaction"],
    executions: [],
    verifications: [],
    receipts: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

async function buildSignedRecord(
  businessTransactionId: string,
  privateKey: ReturnType<typeof generateKeyPairSync<"ed25519">>["privateKey"],
  keyId: string,
): Promise<ExecutionTrustRecord> {
  const draft = draftRecord(businessTransactionId);

  const hasher = new TrustRecordHasher({
    hash: new SHA256HashProvider(),
    signature: new Ed25519SignatureProvider(),
  });

  const trustRecordHash = await hasher.hash(
    canonicalExecutionTrustRecord(draft as ExecutionTrustRecord),
  );

  const withHash = {
    ...draft,
    trustRecordHash,
  } as ExecutionTrustRecord;

  const signer = new ArtifactSigner({
    hash: new SHA256HashProvider(),
    signature: new Ed25519SignatureProvider(),
  });

  // Schema version 3: one signature over the whole record (decision D24).
  const value = await signer.sign(
    hybridSignedCanonicalView(withHash, 3),
    privateKey,
  );

  return {
    ...withHash,
    schemaVersion: 3,
    signatures: [{ algorithm: "ed25519" as const, keyId, signature: value }],
  } as ExecutionTrustRecord;
}

describe("verifyExecutionTrustRecordOffline", () => {
  it("verifies a genuine record with no network, disk, or env var access", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey
      .export({ format: "pem", type: "spki" })
      .toString();

    const record = await buildSignedRecord(
      "txn-offline-valid",
      privateKey,
      "offline-test-key",
    );

    const result = await verifyExecutionTrustRecordOffline(
      record,
      { "offline-test-key": publicKeyPem },
      { allowLegacyOnly: true },
    );

    expect(result.valid).toBe(true);
    expect(result.hashValid).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.algorithmsChecked).toContain("ed25519");
  });

  it("fails when the payload is tampered with after signing", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey
      .export({ format: "pem", type: "spki" })
      .toString();

    const record = await buildSignedRecord(
      "txn-offline-tampered",
      privateKey,
      "offline-test-key",
    );

    const tampered: ExecutionTrustRecord = {
      ...record,
      transaction: {
        ...record.transaction,
        status: "APPROVED" as ExecutionTrustRecord["transaction"]["status"],
      },
    };

    const result = await verifyExecutionTrustRecordOffline(tampered, {
      "offline-test-key": publicKeyPem,
    });

    expect(result.valid).toBe(false);
    // Hash was computed over the original content; the modified
    // transaction no longer matches it, so the hash check itself
    // catches this before signature verification would even need to.
    expect(result.hashValid).toBe(false);
  });

  it("fails against the wrong public key", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const { publicKey: wrongPublicKey } = generateKeyPairSync("ed25519");
    const wrongPem = wrongPublicKey
      .export({ format: "pem", type: "spki" })
      .toString();

    const record = await buildSignedRecord(
      "txn-offline-wrong-key",
      privateKey,
      "offline-test-key",
    );

    const result = await verifyExecutionTrustRecordOffline(record, {
      "offline-test-key": wrongPem,
    });

    expect(result.valid).toBe(false);
    expect(result.valid).toBe(false);
  });

  it("fails closed when no public key is supplied for the record's keyId", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const record = await buildSignedRecord(
      "txn-offline-no-key",
      privateKey,
      "offline-test-key",
    );

    const result = await verifyExecutionTrustRecordOffline(record, {});

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("no public key supplied")),
    ).toBe(true);
  });

  it("fails closed for an unsupported algorithm rather than silently skipping it", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey
      .export({ format: "pem", type: "spki" })
      .toString();

    const record = await buildSignedRecord(
      "txn-offline-bad-alg",
      privateKey,
      "offline-test-key",
    );

    const withBadAlgorithm: ExecutionTrustRecord = {
      ...record,
      signatures: record.signatures!.map((entry) => ({
        ...entry,
        algorithm: "sphincs-plus" as typeof entry.algorithm,
      })),
    };

    const result = await verifyExecutionTrustRecordOffline(withBadAlgorithm, {
      "offline-test-key": publicKeyPem,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unsupported algorithm"))).toBe(
      true,
    );
  });

  describe.skipIf(!isMlDsa65Supported())(
    `hybrid records (schema version 3)${isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`}`,
    () => {
      const pemOf = (key: { export: (o: object) => string | Buffer }) =>
        key.export({ format: "pem", type: "spki" }).toString();

      async function signedHybrid() {
        const ed25519Keys = generateKeyPairSync("ed25519");
        const mldsaKeys = generateKeyPairSync("ml-dsa-65");

        const draft = draftRecord("txn-offline-hybrid");
        const trustRecordHash = await new TrustRecordHasher({
          hash: new SHA256HashProvider(),
          signature: new Ed25519SignatureProvider(),
        }).hash(canonicalExecutionTrustRecord(draft as ExecutionTrustRecord));
        const withHash = { ...draft, trustRecordHash } as ExecutionTrustRecord;

        // Both entries sign the same whole-record view (decision D24).
        const artifact = hybridSignedCanonicalView(withHash, 3);
        const edValue = await new ArtifactSigner({
          hash: new SHA256HashProvider(),
          signature: new Ed25519SignatureProvider(),
        }).sign(artifact, ed25519Keys.privateKey);
        const mlValue = await new ArtifactSigner({
          hash: new SHA256HashProvider(),
          signature: new Dilithium3SignatureProvider(),
        }).sign(artifact, mldsaKeys.privateKey);

        const record = {
          ...withHash,
          schemaVersion: 3,
          signatures: [
            {
              algorithm: "ed25519",
              keyId: "hybrid-primary",
              signature: edValue,
            },
            {
              algorithm: "dilithium3",
              keyId: "hybrid-secondary",
              signature: mlValue,
            },
          ],
        } as unknown as ExecutionTrustRecord;

        const keys = {
          "hybrid-primary": pemOf(ed25519Keys.publicKey),
          "hybrid-secondary": pemOf(mldsaKeys.publicKey),
        };
        return { record, keys };
      }

      it("verifies a genuine hybrid record fully offline", async () => {
        const { record, keys } = await signedHybrid();
        const result = await verifyExecutionTrustRecordOffline(record, keys);
        expect(result.valid).toBe(true);
        expect(result.hybridSignaturesValid).toBe(true);
        expect(result.algorithmsChecked).toEqual(
          expect.arrayContaining(["ed25519", "dilithium3"]),
        );
      });

      it("fails when the ML-DSA-65 entry is stripped from a hybrid record at or after the cutover -- the downgrade attack", async () => {
        const { record, keys } = await signedHybrid();
        const stripped = { ...record, signatures: [record.signatures![0]!] };
        const result = await verifyExecutionTrustRecordOffline(stripped, keys, {
          hybridRequiredFrom: "2026-01-01T00:00:00Z",
        });
        expect(result.valid).toBe(false);
        expect(result.errors.join(" ")).toMatch(/hybridRequiredFrom/);
      });
    },
  );
});

describe("verifyExecutionTrustRecordOffline on malformed input", () => {
  it.each([
    ["null", null],
    ["a string", "not a record"],
    ["a record with no trustRecordHash", {}],
    ["a numeric trustRecordHash", { trustRecordHash: 1 }],
  ])(
    "returns valid: false with a reason for %s, never throws",
    async (_label, input) => {
      const result = await verifyExecutionTrustRecordOffline(
        input as unknown as ExecutionTrustRecord,
        {},
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/malformed input/);
    },
  );
});
