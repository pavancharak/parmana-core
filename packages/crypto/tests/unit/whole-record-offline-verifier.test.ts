import { generateKeyPairSync, type KeyObject } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

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
 * ADR-0016: a schema version 3 hybrid envelope signs every top-level field
 * except the signature envelope and the post-signing fields. These tests use
 * the offline verifier, so they need only the record and the public keys.
 *
 * `updatedAt` is the probe. It is outside the version 2 canonical view, so a
 * version 2 record accepts a changed `updatedAt`, and a version 3 record must
 * reject it.
 */

const PRIMARY_KEY_ID = "whole-record-primary";
const SECONDARY_KEY_ID = "whole-record-secondary";

type TestKeys = {
  ed25519: { privateKey: KeyObject; publicKeyPem: string };
  mldsa: { privateKey: KeyObject; publicKeyPem: string };
};

let keys: TestKeys;

function draftRecord(
  businessTransactionId: string,
): Omit<ExecutionTrustRecord, "trustRecordHash" | "signature"> {
  const createdAt = new Date("2026-01-01T00:00:00Z");

  return {
    trustRecordId: businessTransactionId,
    businessTransactionId,
    transaction: {
      businessTransactionId,
      status: "RECEIVED",
      createdAt,
    } as ExecutionTrustRecord["transaction"],
    overrides: [],
    executions: [],
    verifications: [],
    receipts: [],
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * Builds a record the way BusinessTrustRecordBuilder does: hash the legacy
 * canonical view, add the legacy signature, then add the hybrid envelope under
 * the requested schema version.
 */
async function buildHybridRecord(
  schemaVersion: 2 | 3,
): Promise<ExecutionTrustRecord> {
  const draft = draftRecord(`txn-whole-record-v${schemaVersion}`);

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
      keyId: PRIMARY_KEY_ID,
      value: "",
      signedAt: new Date("2026-01-01T00:00:00Z"),
    },
  } as ExecutionTrustRecord;

  const legacySigner = new ArtifactSigner({
    hash: new SHA256HashProvider(),
    signature: new Ed25519SignatureProvider(),
  });

  const legacyValue = await legacySigner.sign(
    canonicalExecutionTrustRecord(withHash),
    keys.ed25519.privateKey,
  );

  const hybridArtifact = hybridSignedCanonicalView(withHash, schemaVersion);

  const ed25519Value = await legacySigner.sign(
    hybridArtifact,
    keys.ed25519.privateKey,
  );

  const dilithiumSigner = new ArtifactSigner({
    hash: new SHA256HashProvider(),
    signature: new Dilithium3SignatureProvider(),
  });

  const dilithiumValue = await dilithiumSigner.sign(
    hybridArtifact,
    keys.mldsa.privateKey,
  );

  return {
    ...withHash,
    signature: { ...withHash.signature, value: legacyValue },
    schemaVersion,
    signatures: [
      { algorithm: "ed25519", keyId: PRIMARY_KEY_ID, signature: ed25519Value },
      {
        algorithm: "dilithium3",
        keyId: SECONDARY_KEY_ID,
        signature: dilithiumValue,
      },
    ],
  };
}

function trustedKeys(): Record<string, string> {
  return {
    [PRIMARY_KEY_ID]: keys.ed25519.publicKeyPem,
    [SECONDARY_KEY_ID]: keys.mldsa.publicKeyPem,
  };
}

describe.skipIf(!isMlDsa65Supported())(
  `whole-record hybrid signatures, schema version 3${isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`}`,
  () => {
    beforeAll(() => {
      const ed25519 = generateKeyPairSync("ed25519");
      const mldsa = generateKeyPairSync("ml-dsa-65");

      keys = {
        ed25519: {
          privateKey: ed25519.privateKey,
          publicKeyPem: ed25519.publicKey
            .export({ format: "pem", type: "spki" })
            .toString(),
        },
        mldsa: {
          privateKey: mldsa.privateKey,
          publicKeyPem: mldsa.publicKey
            .export({ format: "pem", type: "spki" })
            .toString(),
        },
      };
    });

    it("verifies a version 3 record after a JSON round trip, as an auditor reads it from a file", async () => {
      const record = await buildHybridRecord(3);

      const fromFile = JSON.parse(
        JSON.stringify(record),
      ) as ExecutionTrustRecord;

      const result = await verifyExecutionTrustRecordOffline(
        fromFile,
        trustedKeys(),
      );

      expect(result.valid).toBe(true);
      expect(result.hybridSignaturesValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("rejects a changed updatedAt, which the hash does not cover and the version 3 signature does", async () => {
      const record = await buildHybridRecord(3);

      const tampered = {
        ...record,
        updatedAt: new Date("2026-02-01T00:00:00Z"),
      } as ExecutionTrustRecord;

      const result = await verifyExecutionTrustRecordOffline(
        tampered,
        trustedKeys(),
      );

      expect(result.hashValid).toBe(true);
      expect(result.hybridSignaturesValid).toBe(false);
      expect(result.valid).toBe(false);
    });

    it("accepts the same updatedAt change on a version 2 record, which shows the gap version 3 closes", async () => {
      const record = await buildHybridRecord(2);

      const tampered = {
        ...record,
        updatedAt: new Date("2026-02-01T00:00:00Z"),
      } as ExecutionTrustRecord;

      const result = await verifyExecutionTrustRecordOffline(
        tampered,
        trustedKeys(),
      );

      expect(result.hybridSignaturesValid).toBe(true);
      expect(result.valid).toBe(true);
    });

    it("rejects a version 3 record relabelled as version 2, because the signed view differs", async () => {
      const record = await buildHybridRecord(3);

      const relabelled = { ...record, schemaVersion: 2 };

      const result = await verifyExecutionTrustRecordOffline(
        relabelled,
        trustedKeys(),
      );

      expect(result.hybridSignaturesValid).toBe(false);
      expect(result.valid).toBe(false);
    });

    it("rejects a version 3 record whose signatures array is empty", async () => {
      const record = await buildHybridRecord(3);

      const stripped = { ...record, signatures: [] };

      const result = await verifyExecutionTrustRecordOffline(
        stripped,
        trustedKeys(),
      );

      expect(result.valid).toBe(false);
      expect(result.hybridSignaturesValid).toBe(false);
      expect(result.errors.join(" ")).toMatch(/no signatures array/);
    });

    it("rejects a record that declares an unsupported schema version", async () => {
      const record = await buildHybridRecord(3);

      const future = { ...record, schemaVersion: 4 };

      const result = await verifyExecutionTrustRecordOffline(
        future,
        trustedKeys(),
      );

      expect(result.valid).toBe(false);
      expect(result.errors.join(" ")).toMatch(/unsupported schemaVersion 4/);
    });
  },
);
