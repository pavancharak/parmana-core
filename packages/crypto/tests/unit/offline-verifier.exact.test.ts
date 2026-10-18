import { generateKeyPairSync, type KeyObject } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ExecutionIntent, ExecutionTrustRecord } from "@parmana/shared";

import { ArtifactSigner } from "../../src/ArtifactSigner.js";
import { canonicalExecutionIntent } from "../../src/ExecutionIntentCanonicalView.js";
import {
  canonicalExecutionTrustRecord,
  hybridCanonicalExecutionTrustRecord,
} from "../../src/ExecutionTrustRecordCanonicalView.js";
import {
  verifyExecutionIntentOffline,
  verifyExecutionTrustRecordOffline,
} from "../../src/OfflineVerifier.js";
import { TrustRecordHasher } from "../../src/TrustRecordHasher.js";
import { SHA256HashProvider } from "../../src/providers/hash/SHA256HashProvider.js";
import { Dilithium3SignatureProvider } from "../../src/providers/signature/Dilithium3SignatureProvider.js";
import { Ed25519SignatureProvider } from "../../src/providers/signature/Ed25519SignatureProvider.js";
import {
  isMlDsa65Supported,
  ML_DSA_65_SKIP_REASON,
} from "../../src/support/MlDsaSupport.js";

/**
 * Mutation testing found the offline verifier's hybrid path tested only
 * with a genuine record and a stripped one: a hybrid record with one
 * bad signature, a single entry, a duplicate algorithm, an empty array,
 * or a key that cannot be read could each be accepted by a changed
 * verifier without a test failing. Each case is pinned here, with the
 * exact result an auditor would see.
 */

const ed = new Ed25519SignatureProvider();
const sha = new SHA256HashProvider();
const edSigner = new ArtifactSigner({ hash: sha, signature: ed });
const pem = (key: KeyObject) =>
  key.export({ format: "pem", type: "spki" }).toString();

const edKeys = generateKeyPairSync("ed25519");
const otherEdKeys = generateKeyPairSync("ed25519");

async function legacyRecord(id = "txn-exact"): Promise<ExecutionTrustRecord> {
  const draft = {
    trustRecordId: id,
    businessTransactionId: id,
    transaction: {
      businessTransactionId: id,
      status: "RECEIVED",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    overrides: [],
    executions: [],
    verifications: [],
    receipts: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  } as unknown as ExecutionTrustRecord;
  const trustRecordHash = await new TrustRecordHasher({
    hash: sha,
    signature: ed,
  }).hash(canonicalExecutionTrustRecord(draft));
  const withHash = {
    ...draft,
    trustRecordHash,
    signature: {
      algorithm: "ed25519" as const,
      keyId: "primary",
      value: "",
      signedAt: new Date(),
    },
  } as ExecutionTrustRecord;
  const value = await edSigner.sign(
    canonicalExecutionTrustRecord(withHash),
    edKeys.privateKey,
  );
  return { ...withHash, signature: { ...withHash.signature, value } };
}

const KEYS = { primary: pem(edKeys.publicKey) };

describe("verifyExecutionTrustRecordOffline, exactly", () => {
  it("reports a genuine legacy record with nothing else", async () => {
    expect(
      await verifyExecutionTrustRecordOffline(await legacyRecord(), KEYS),
    ).toStrictEqual({
      valid: true,
      hashValid: true,
      legacySignatureValid: true,
      algorithmsChecked: ["ed25519"],
      errors: [],
    });
  });

  it("names both hashes when the record's hash does not match its content", async () => {
    const record = { ...(await legacyRecord()), trustRecordHash: "deadbeef" };
    const result = await verifyExecutionTrustRecordOffline(record, KEYS);
    const expected = (await legacyRecord()).trustRecordHash;
    expect(result.valid).toBe(false);
    expect(result.hashValid).toBe(false);
    expect(result.errors).toContain(
      `trustRecordHash mismatch: expected ${expected}, got deadbeef.`,
    );
  });

  it("names the key whose signature does not verify", async () => {
    const result = await verifyExecutionTrustRecordOffline(
      await legacyRecord(),
      { primary: pem(otherEdKeys.publicKey) },
    );
    expect(result).toMatchObject({ valid: false, legacySignatureValid: false });
    expect(result.errors).toEqual([
      'signature verification failed for keyId "primary" (ed25519).',
    ]);
  });

  it("reports a key that cannot be read as an error, never as valid", async () => {
    const result = await verifyExecutionTrustRecordOffline(
      await legacyRecord(),
      {
        primary:
          "-----BEGIN PUBLIC KEY-----\nnot a key\n-----END PUBLIC KEY-----",
      },
    );
    expect(result).toMatchObject({ valid: false, legacySignatureValid: false });
    expect(result.errors[0]).toMatch(
      /^error verifying keyId "primary" \(ed25519\): /,
    );
  });

  it.each([
    ["null entry", [null]],
    ["entry missing its signature", [{ algorithm: "ed25519", keyId: "k" }]],
    ["a string", "sig"],
    ["an object", { algorithm: "ed25519" }],
  ])(
    "refuses malformed signatures (%s) without throwing",
    async (_label, signatures) => {
      const result = await verifyExecutionTrustRecordOffline(
        {
          ...(await legacyRecord()),
          signatures,
        } as unknown as ExecutionTrustRecord,
        KEYS,
      );
      expect(result).toMatchObject({
        valid: false,
        legacySignatureValid: true,
        hybridSignaturesValid: false,
      });
      expect(result.errors).toContain(
        "malformed signatures: expected an array of entries with string algorithm, keyId and signature.",
      );
    },
  );

  it("treats an empty signatures array as no hybrid envelope", async () => {
    const result = await verifyExecutionTrustRecordOffline(
      { ...(await legacyRecord()), signatures: [] },
      KEYS,
    );
    expect(result.valid).toBe(true);
    expect(result).not.toHaveProperty("hybridSignaturesValid");
  });

  it.each([
    [
      "no hash",
      { signature: { algorithm: "ed25519", keyId: "k", value: "v" } },
    ],
    [
      "a numeric hash",
      {
        trustRecordHash: 1,
        signature: { algorithm: "ed25519", keyId: "k", value: "v" },
      },
    ],
    ["a null signature", { trustRecordHash: "h", signature: null }],
    ["a string signature", { trustRecordHash: "h", signature: "v" }],
    [
      "no algorithm",
      { trustRecordHash: "h", signature: { keyId: "k", value: "v" } },
    ],
    [
      "no keyId",
      { trustRecordHash: "h", signature: { algorithm: "ed25519", value: "v" } },
    ],
    [
      "no value",
      { trustRecordHash: "h", signature: { algorithm: "ed25519", keyId: "k" } },
    ],
  ])("refuses a record with %s, exactly", async (_label, input) => {
    expect(
      await verifyExecutionTrustRecordOffline(
        input as unknown as ExecutionTrustRecord,
        { k: KEYS.primary },
      ),
    ).toStrictEqual({
      valid: false,
      hashValid: false,
      legacySignatureValid: false,
      algorithmsChecked: [],
      errors: [
        "malformed input: expected an object with a string trustRecordHash and a signature with algorithm, keyId and value.",
      ],
    });
  });

  describe.skipIf(!isMlDsa65Supported())(
    `hybrid records${isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`}`,
    () => {
      const mlKeys = isMlDsa65Supported()
        ? generateKeyPairSync("ml-dsa-65")
        : undefined;
      const mlSigner = new ArtifactSigner({
        hash: sha,
        signature: new Dilithium3SignatureProvider(),
      });
      const hybridKeys = () => ({
        primary: pem(edKeys.publicKey),
        secondary: pem(mlKeys!.publicKey),
      });

      async function hybridRecord(options: { schemaVersion?: number } = {}) {
        const base = await legacyRecord("txn-hybrid");
        const artifact = hybridCanonicalExecutionTrustRecord(base, 2);
        const record = {
          ...base,
          ...(options.schemaVersion !== undefined
            ? { schemaVersion: options.schemaVersion }
            : {}),
          signatures: [
            {
              algorithm: "ed25519" as const,
              keyId: "primary",
              signature: await edSigner.sign(artifact, edKeys.privateKey),
            },
            {
              algorithm: "dilithium3" as const,
              keyId: "secondary",
              signature: await mlSigner.sign(artifact, mlKeys!.privateKey),
            },
          ],
        } as ExecutionTrustRecord;
        return record;
      }

      it("verifies a genuine hybrid record, schemaVersion 2 by default, checking every algorithm", async () => {
        expect(
          await verifyExecutionTrustRecordOffline(
            await hybridRecord(),
            hybridKeys(),
          ),
        ).toStrictEqual({
          valid: true,
          hashValid: true,
          legacySignatureValid: true,
          hybridSignaturesValid: true,
          algorithmsChecked: ["ed25519", "ed25519", "dilithium3"],
          errors: [],
        });
      });

      it.each([0, 1])(
        "refuses a hybrid record whose entry %i does not verify, though the others do",
        async (index) => {
          const record = await hybridRecord({ schemaVersion: 2 });
          const signatures = [...record.signatures!];
          const other = signatures[1 - index]!.signature;
          signatures[index] = { ...signatures[index]!, signature: other };
          const result = await verifyExecutionTrustRecordOffline(
            { ...record, signatures },
            hybridKeys(),
          );
          expect(result).toMatchObject({
            valid: false,
            legacySignatureValid: true,
            hybridSignaturesValid: false,
          });
        },
      );

      it("refuses a hybrid record signed for another schemaVersion", async () => {
        const result = await verifyExecutionTrustRecordOffline(
          await hybridRecord({ schemaVersion: 3 }),
          hybridKeys(),
        );
        expect(result.hybridSignaturesValid).toBe(false);
      });

      it("refuses a single hybrid entry, though it verifies", async () => {
        const record = await hybridRecord();
        const result = await verifyExecutionTrustRecordOffline(
          { ...record, signatures: [record.signatures![0]!] },
          hybridKeys(),
        );
        expect(result).toMatchObject({
          valid: false,
          hybridSignaturesValid: false,
        });
        expect(result.errors).toEqual([
          "signatures array has 1 entry, need at least 2 for a hybrid record.",
        ]);
      });

      it("refuses a duplicate algorithm, even when every entry verifies", async () => {
        const record = await hybridRecord();
        const [first, second] = record.signatures!;
        const result = await verifyExecutionTrustRecordOffline(
          { ...record, signatures: [first!, first!, second!] },
          hybridKeys(),
        );
        expect(result).toMatchObject({
          valid: false,
          hybridSignaturesValid: false,
        });
        expect(result.errors).toEqual([
          "duplicate algorithm in signatures array: ed25519.",
        ]);
        expect(result.algorithmsChecked).toEqual([
          "ed25519",
          "ed25519",
          "dilithium3",
        ]);
      });

      it("refuses two entries of one algorithm, naming the count rule's plural", async () => {
        const record = await hybridRecord();
        const [first] = record.signatures!;
        const result = await verifyExecutionTrustRecordOffline(
          { ...record, signatures: [first!, first!] },
          hybridKeys(),
        );
        expect(result.hybridSignaturesValid).toBe(false);
        expect(result.errors).toEqual([
          "duplicate algorithm in signatures array: ed25519.",
        ]);
      });
    },
  );
});

describe("verifyExecutionIntentOffline, exactly", () => {
  async function intent(): Promise<ExecutionIntent> {
    const draft = {
      intentId: "intent-1",
      businessTransactionId: "tx-1",
      decisionId: "decision-1",
      authorizationId: "authorization-1",
      policyName: "customer-refund",
      policyVersion: "1.0.0",
      policyContentHash: "policy-hash",
      signalsHash: "signals-hash",
      businessTransactionHash: "content-hash",
      action: "paytm:refund",
      target: "paytm://orders/1",
      submittedBy: "caller-1",
      createdAt: new Date("2026-09-21T00:00:00.000Z"),
      intentHash: "",
      signature: {
        algorithm: "ed25519" as const,
        keyId: "primary",
        value: "",
        signedAt: new Date("2026-09-21T00:00:00.000Z"),
      },
    } as ExecutionIntent;
    const intentHash = await new TrustRecordHasher({
      hash: sha,
      signature: ed,
    }).hash(canonicalExecutionIntent(draft));
    const value = await edSigner.sign(
      canonicalExecutionIntent(draft),
      edKeys.privateKey,
    );
    return { ...draft, intentHash, signature: { ...draft.signature, value } };
  }

  it("verifies a genuine intent, exactly", async () => {
    expect(
      await verifyExecutionIntentOffline(await intent(), KEYS),
    ).toStrictEqual({
      valid: true,
      hashValid: true,
      legacySignatureValid: true,
      algorithmsChecked: ["ed25519"],
      errors: [],
    });
  });

  it("names both hashes on a hash mismatch", async () => {
    const genuine = await intent();
    const result = await verifyExecutionIntentOffline(
      { ...genuine, intentHash: "deadbeef" },
      KEYS,
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `intentHash mismatch: expected ${genuine.intentHash}, got deadbeef.`,
    );
  });

  it("refuses a malformed intent with the intent's own field name", async () => {
    expect(
      await verifyExecutionIntentOffline(
        null as unknown as ExecutionIntent,
        KEYS,
      ),
    ).toMatchObject({
      valid: false,
      errors: [
        "malformed input: expected an object with a string intentHash and a signature with algorithm, keyId and value.",
      ],
    });
  });
});
