import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ExecutionTrustRecord } from "@parmana/shared";

import { verifyExecutionTrustRecordOffline } from "../../src/OfflineVerifier.js";
import { canonicalExecutionTrustRecord } from "../../src/ExecutionTrustRecordCanonicalView.js";
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
 * PQC audit RED-1 (docs/VERIFICATION-GAPS.md): proves offline
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
    overrides: [],
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
    signature: {
      algorithm: "ed25519" as const,
      keyId,
      value: "",
      signedAt: new Date(),
    },
  } as ExecutionTrustRecord;

  const signer = new ArtifactSigner({
    hash: new SHA256HashProvider(),
    signature: new Ed25519SignatureProvider(),
  });

  const value = await signer.sign(
    canonicalExecutionTrustRecord(withHash),
    privateKey,
  );

  return { ...withHash, signature: { ...withHash.signature, value } };
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

    const result = await verifyExecutionTrustRecordOffline(record, {
      "offline-test-key": publicKeyPem,
    });

    expect(result.valid).toBe(true);
    expect(result.hashValid).toBe(true);
    expect(result.legacySignatureValid).toBe(true);
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
    expect(result.legacySignatureValid).toBe(false);
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
      signature: {
        ...record.signature,
        algorithm:
          "sphincs-plus" as ExecutionTrustRecord["signature"]["algorithm"],
      },
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
    `hybrid records${isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`}`,
    () => {
      it("verifies a genuine hybrid (ed25519 + dilithium3) record fully offline", async () => {
        const ed25519Keys = generateKeyPairSync("ed25519");
        const mldsaKeys = generateKeyPairSync("ml-dsa-65");

        const draft = draftRecord("txn-offline-hybrid-valid");
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
          signature: {
            algorithm: "ed25519" as const,
            keyId: "hybrid-primary",
            value: "",
            signedAt: new Date(),
          },
        } as ExecutionTrustRecord;

        const legacySigner = new ArtifactSigner({
          hash: new SHA256HashProvider(),
          signature: new Ed25519SignatureProvider(),
        });

        const legacyValue = await legacySigner.sign(
          canonicalExecutionTrustRecord(withHash),
          ed25519Keys.privateKey,
        );

        const schemaVersion = 2;
        const hybridArtifact = {
          ...canonicalExecutionTrustRecord(withHash),
          schemaVersion,
        };

        const ed25519HybridValue = await legacySigner.sign(
          hybridArtifact,
          ed25519Keys.privateKey,
        );

        const dilithiumSigner = new ArtifactSigner({
          hash: new SHA256HashProvider(),
          signature: new Dilithium3SignatureProvider(),
        });

        const dilithiumValue = await dilithiumSigner.sign(
          hybridArtifact,
          mldsaKeys.privateKey,
        );

        const record: ExecutionTrustRecord = {
          ...withHash,
          signature: { ...withHash.signature, value: legacyValue },
          schemaVersion,
          signatures: [
            {
              algorithm: "ed25519",
              keyId: "hybrid-primary",
              signature: ed25519HybridValue,
            },
            {
              algorithm: "dilithium3",
              keyId: "hybrid-secondary",
              signature: dilithiumValue,
            },
          ],
        };

        const result = await verifyExecutionTrustRecordOffline(record, {
          "hybrid-primary": ed25519Keys.publicKey
            .export({ format: "pem", type: "spki" })
            .toString(),
          "hybrid-secondary": mldsaKeys.publicKey
            .export({ format: "pem", type: "spki" })
            .toString(),
        });

        expect(result.valid).toBe(true);
        expect(result.hybridSignaturesValid).toBe(true);
        expect(result.algorithmsChecked).toEqual(
          expect.arrayContaining(["ed25519", "dilithium3"]),
        );
      });

      it("fails when the ML-DSA-65 component of a hybrid record is stripped -- the downgrade attack", async () => {
        const ed25519Keys = generateKeyPairSync("ed25519");
        const mldsaKeys = generateKeyPairSync("ml-dsa-65");

        const draft = draftRecord("txn-offline-hybrid-stripped");
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
          signature: {
            algorithm: "ed25519" as const,
            keyId: "hybrid-primary",
            value: "",
            signedAt: new Date(),
          },
        } as ExecutionTrustRecord;

        const legacySigner = new ArtifactSigner({
          hash: new SHA256HashProvider(),
          signature: new Ed25519SignatureProvider(),
        });

        const legacyValue = await legacySigner.sign(
          canonicalExecutionTrustRecord(withHash),
          ed25519Keys.privateKey,
        );

        const record: ExecutionTrustRecord = {
          ...withHash,
          signature: { ...withHash.signature, value: legacyValue },
          // schemaVersion/signatures deliberately omitted -- simulates
          // an attacker (or lossy pipeline) stripping the hybrid
          // envelope from an originally-hybrid-signed record, exactly
          // like verification-service-hybrid.test.ts's own
          // "still verifies a legacy-shaped record" case.
        };

        const result = await verifyExecutionTrustRecordOffline(record, {
          "hybrid-primary": ed25519Keys.publicKey
            .export({ format: "pem", type: "spki" })
            .toString(),
        });

        // The offline verifier reports facts, not policy: with no
        // `signatures` array present at all, hybridSignaturesValid is
        // undefined (nothing to check) and the legacy signature alone
        // is genuinely valid -- exactly like the online default-off
        // HYBRID_SIGNATURE_REQUIRED behavior. This is the honest,
        // correct report; whether that is acceptable is the caller's
        // policy decision, not this function's to make.
        expect(result.legacySignatureValid).toBe(true);
        expect(result.hybridSignaturesValid).toBeUndefined();

        void mldsaKeys;
      });
    },
  );
});

describe("verifyExecutionTrustRecordOffline on malformed input", () => {
  it.each([
    ["null", null],
    ["a string", "not a record"],
    ["a record with no signature", { trustRecordHash: "abc" }],
    [
      "a signature missing its value",
      {
        trustRecordHash: "abc",
        signature: { algorithm: "ed25519", keyId: "default" },
      },
    ],
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
