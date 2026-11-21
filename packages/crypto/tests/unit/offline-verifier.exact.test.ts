import { generateKeyPairSync, type KeyObject } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ExecutionIntent, ExecutionTrustRecord } from "@parmana/shared";

import { ArtifactSigner } from "../../src/ArtifactSigner.js";
import { canonicalExecutionIntent } from "../../src/ExecutionIntentCanonicalView.js";
import {
  canonicalExecutionTrustRecord,
  hybridSignedCanonicalView,
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
 * Mutation testing found the offline verifier's envelope tested only with a genuine record and a
 * stripped one. Each case is pinned here, with the exact result an auditor would see.
 *
 * Schema version 3 only (decision D24): a trust record carries a signatures array covering the whole
 * record. A single-signed record has one entry; a hybrid record has two. There is no legacy signature.
 */

const ed = new Ed25519SignatureProvider();
const sha = new SHA256HashProvider();
const edSigner = new ArtifactSigner({ hash: sha, signature: ed });
const pem = (key: KeyObject) =>
  key.export({ format: "pem", type: "spki" }).toString();

const edKeys = generateKeyPairSync("ed25519");
const otherEdKeys = generateKeyPairSync("ed25519");

async function v3Record(id = "txn-exact"): Promise<ExecutionTrustRecord> {
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
  const withHash = { ...draft, trustRecordHash } as ExecutionTrustRecord;
  const value = await edSigner.sign(
    hybridSignedCanonicalView(withHash, 3),
    edKeys.privateKey,
  );
  return {
    ...withHash,
    schemaVersion: 3,
    signatures: [
      { algorithm: "ed25519" as const, keyId: "primary", signature: value },
    ],
  } as ExecutionTrustRecord;
}

const KEYS = { primary: pem(edKeys.publicKey) };

describe("verifyExecutionTrustRecordOffline, exactly (schema version 3)", () => {
  it("reports a genuine single-signed record with nothing else", async () => {
    expect(
      await verifyExecutionTrustRecordOffline(await v3Record(), KEYS),
    ).toStrictEqual({
      valid: true,
      hashValid: true,
      hybridSignaturesValid: true,
      algorithmsChecked: ["ed25519"],
      errors: [],
    });
  });

  it("names both hashes when the record's hash does not match its content", async () => {
    const record = { ...(await v3Record()), trustRecordHash: "deadbeef" };
    const result = await verifyExecutionTrustRecordOffline(record, KEYS);
    const expected = (await v3Record()).trustRecordHash;
    expect(result.valid).toBe(false);
    expect(result.hashValid).toBe(false);
    expect(result.errors).toContain(
      `trustRecordHash mismatch: expected ${expected}, got deadbeef.`,
    );
  });

  it("names the key whose signature does not verify", async () => {
    const result = await verifyExecutionTrustRecordOffline(await v3Record(), {
      primary: pem(otherEdKeys.publicKey),
    });
    expect(result).toMatchObject({
      valid: false,
      hybridSignaturesValid: false,
    });
    expect(result.errors).toEqual([
      'signature verification failed for keyId "primary" (ed25519).',
    ]);
  });

  it("reports a key that cannot be read as an error, never as valid", async () => {
    const result = await verifyExecutionTrustRecordOffline(await v3Record(), {
      primary:
        "-----BEGIN PUBLIC KEY-----\nnot a key\n-----END PUBLIC KEY-----",
    });
    expect(result).toMatchObject({
      valid: false,
      hybridSignaturesValid: false,
    });
    expect(result.errors[0]).toMatch(
      /^error verifying keyId "primary" \(ed25519\): /,
    );
  });

  it.each([2, undefined])(
    "refuses schemaVersion %s: only schemaVersion 3 is accepted (D24)",
    async (version) => {
      const { schemaVersion: _v, ...base } = await v3Record();
      const record = (
        version === undefined ? base : { ...base, schemaVersion: version }
      ) as ExecutionTrustRecord;
      const result = await verifyExecutionTrustRecordOffline(record, KEYS);
      expect(result.valid).toBe(false);
      expect(result.errors.join(" ")).toMatch(
        /schemaVersion|only schemaVersion 3/,
      );
    },
  );

  it("refuses an empty signatures array: a whole-record signature is required", async () => {
    const result = await verifyExecutionTrustRecordOffline(
      { ...(await v3Record()), signatures: [] },
      KEYS,
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "schemaVersion 3 record has no signatures array: a whole-record signature is required.",
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
          ...(await v3Record()),
          signatures,
        } as unknown as ExecutionTrustRecord,
        KEYS,
      );
      expect(result).toMatchObject({
        valid: false,
        hybridSignaturesValid: false,
      });
      expect(result.errors).toContain(
        "malformed signatures: expected an array of entries with string algorithm, keyId and signature.",
      );
    },
  );

  it.each([
    ["no hash", {}],
    ["a numeric hash", { trustRecordHash: 1 }],
  ])("refuses a record with %s, exactly", async (_label, input) => {
    expect(
      await verifyExecutionTrustRecordOffline(
        input as unknown as ExecutionTrustRecord,
        KEYS,
      ),
    ).toStrictEqual({
      valid: false,
      hashValid: false,
      algorithmsChecked: [],
      errors: [
        "malformed input: expected an object with a string trustRecordHash.",
      ],
    });
  });

  it("accepts a single-signed record before the cutover", async () => {
    const result = await verifyExecutionTrustRecordOffline(
      await v3Record(),
      KEYS,
      { hybridRequiredFrom: "2026-02-01T00:00:00Z" },
    );
    expect(result.valid).toBe(true);
  });

  it("refuses a single-signed record at or after the cutover: both hybrid signatures are required", async () => {
    const result = await verifyExecutionTrustRecordOffline(
      await v3Record(),
      KEYS,
      { hybridRequiredFrom: "2026-01-01T00:00:00Z" },
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "record created at or after hybridRequiredFrom (2026-01-01T00:00:00Z) must carry both hybrid signatures.",
    );
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
        const base = await v3Record("txn-hybrid");
        const artifact = hybridSignedCanonicalView(base, 3);
        return {
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
      }

      it("verifies a genuine hybrid record, checking every algorithm", async () => {
        expect(
          await verifyExecutionTrustRecordOffline(
            await hybridRecord(),
            hybridKeys(),
          ),
        ).toStrictEqual({
          valid: true,
          hashValid: true,
          hybridSignaturesValid: true,
          algorithmsChecked: ["ed25519", "dilithium3"],
          errors: [],
        });
      });

      it.each([0, 1])(
        "refuses a hybrid record whose entry %i does not verify, though the others do",
        async (index) => {
          const record = await hybridRecord();
          const signatures = [...record.signatures!];
          const other = signatures[1 - index]!.signature;
          signatures[index] = { ...signatures[index]!, signature: other };
          const result = await verifyExecutionTrustRecordOffline(
            { ...record, signatures },
            hybridKeys(),
          );
          expect(result).toMatchObject({
            valid: false,
            hybridSignaturesValid: false,
          });
        },
      );

      it("refuses a hybrid record that declares schemaVersion 2 (D24)", async () => {
        const result = await verifyExecutionTrustRecordOffline(
          await hybridRecord({ schemaVersion: 2 }),
          hybridKeys(),
        );
        expect(result.valid).toBe(false);
        expect(result.errors.join(" ")).toMatch(/only schemaVersion 3/);
      });

      it("refuses three hybrid entries, though every one verifies", async () => {
        const record = await hybridRecord();
        const [first, second] = record.signatures!;
        const result = await verifyExecutionTrustRecordOffline(
          { ...record, signatures: [first!, second!, first!] },
          hybridKeys(),
        );
        expect(result).toMatchObject({
          valid: false,
          hybridSignaturesValid: false,
        });
        expect(result.errors).toContain(
          "signatures array has 3 entries; at most 2 are allowed.",
        );
      });

      it("refuses a duplicate algorithm, even when every entry verifies", async () => {
        const record = await hybridRecord();
        const [first] = record.signatures!;
        const result = await verifyExecutionTrustRecordOffline(
          { ...record, signatures: [first!, first!] },
          hybridKeys(),
        );
        expect(result).toMatchObject({
          valid: false,
          hybridSignaturesValid: false,
        });
        expect(result.errors).toEqual([
          "duplicate algorithm in signatures array: ed25519.",
        ]);
        expect(result.algorithmsChecked).toEqual(["ed25519"]);
      });

      it("refuses two entries of one algorithm", async () => {
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

      it("refuses a single entry from the cutover on, though it verifies", async () => {
        const record = await hybridRecord();
        const result = await verifyExecutionTrustRecordOffline(
          { ...record, signatures: [record.signatures![0]!] },
          hybridKeys(),
          { hybridRequiredFrom: "2026-01-01T00:00:00Z" },
        );
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          "record created at or after hybridRequiredFrom (2026-01-01T00:00:00Z) must carry both hybrid signatures.",
        );
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
