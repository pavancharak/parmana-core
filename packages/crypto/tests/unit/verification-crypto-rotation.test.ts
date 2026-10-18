import { generateKeyPairSync } from "node:crypto";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { ExecutionTrustRecord } from "@parmana/shared";

import { VerificationCrypto } from "../../src/VerificationCrypto.js";

/**
 * PQC audit RED-3 (docs/VERIFICATION-GAPS.md): proves the fix for
 * durable-evidence key rotation end to end -- a Trust Record signed
 * under one keyId keeps verifying after PARMANA_VERIFICATION_KEY_ID
 * points future signing at a different one, mirroring exactly the
 * reproduction that first demonstrated the gap (sign, "rotate" by
 * regenerating the hardcoded "default" keyId in place, re-verify --
 * that version fails; this test proves the fix does not).
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

async function signRecord(
  crypto: VerificationCrypto,
  businessTransactionId: string,
): Promise<ExecutionTrustRecord> {
  const draft = draftRecord(businessTransactionId);
  const trustRecordHash = await crypto.hash(draft as ExecutionTrustRecord);

  const withHash = {
    ...draft,
    trustRecordHash,
    signature: {
      algorithm: "ed25519" as const,
      keyId: "placeholder",
      value: "",
      signedAt: new Date(),
    },
  } as ExecutionTrustRecord;

  const signature = await crypto.sign(withHash);

  return { ...withHash, signature };
}

describe("VerificationCrypto key rotation (PQC audit RED-3)", () => {
  it("verifies a record signed before rotation, after PARMANA_VERIFICATION_KEY_ID points at a new keyId", async () => {
    const keyDir = process.env.PARMANA_KEY_DIR;

    if (!keyDir) {
      throw new Error(
        "PARMANA_KEY_DIR was not set by vitest.setup.ts as expected.",
      );
    }

    delete process.env.PARMANA_VERIFICATION_KEY_ID;

    try {
      const beforeRotation = new VerificationCrypto();
      const originalRecord = await signRecord(
        beforeRotation,
        "txn-rotation-original",
      );

      expect(originalRecord.signature.keyId).toBe("default");
      expect(await beforeRotation.verify(originalRecord)).toBe(true);

      // Rotate: mint a brand-new keyId's key pair -- exactly what
      // scripts/rotate-verification-key.ts does -- without touching
      // "default"'s files at all.
      const rotatedKeyId = "verification-primary-rotation-test";
      const { privateKey, publicKey } = generateKeyPairSync("ed25519");

      writeFileSync(
        join(keyDir, `${rotatedKeyId}.private.pem`),
        privateKey.export({ format: "pem", type: "pkcs8" }),
      );
      writeFileSync(
        join(keyDir, `${rotatedKeyId}.public.pem`),
        publicKey.export({ format: "pem", type: "spki" }),
      );

      process.env.PARMANA_VERIFICATION_KEY_ID = rotatedKeyId;

      const afterRotation = new VerificationCrypto();
      const newRecord = await signRecord(afterRotation, "txn-rotation-new");

      expect(newRecord.signature.keyId).toBe(rotatedKeyId);
      expect(newRecord.signature.keyId).not.toBe(
        originalRecord.signature.keyId,
      );

      // The record signed BEFORE rotation must still verify, using a
      // freshly constructed VerificationCrypto (a new process/request
      // after redeploy, not the same instance that signed it).
      expect(await afterRotation.verify(originalRecord)).toBe(true);

      // And the record signed AFTER rotation verifies too, under its
      // own (new) keyId.
      expect(await afterRotation.verify(newRecord)).toBe(true);
    } finally {
      delete process.env.PARMANA_VERIFICATION_KEY_ID;
    }
  });
});
