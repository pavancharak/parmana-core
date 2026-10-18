import { generateKeyPairSync, sign as nodeSign } from "node:crypto";
import { writeFileSync } from "node:fs";

import {
  ArtifactSigner,
  CanonicalSerializer,
  CryptoBootstrap,
  KMS_RAW_MESSAGE_LIMIT_BYTES,
  VerificationCrypto,
  canonicalExecutionTrustRecord,
  commitmentMessage,
  requiresCommitment,
  type Signer,
} from "@parmana/crypto";
import type { ExecutionTrustRecord } from "@parmana/shared";

/**
 * Generates a real, TypeScript-signed Execution Trust Record fixture
 * plus its public key, for the cross-language determinism proof
 * (PQC audit Layer 5) -- python/tests/test_offline_verifier.py signs
 * nothing itself; it reads exactly what this script produces and
 * proves the Python OfflineVerifier can independently verify it.
 *
 * Usage:
 *   npx tsx scripts/generate-offline-verifier-fixture.ts <out-dir>
 *
 * Writes <out-dir>/record.json, <out-dir>/record-large.json (a record over
 * 4096 bytes signed the way the KMS signer signs a large message, as a
 * commitment, see ADR-0010) and <out-dir>/public-key.pem. Uses an
 * ephemeral keypair (not PARMANA_KEY_DIR's "default" key) and its own
 * PARMANA_VERIFICATION_KEY_ID override so this never touches or
 * depends on any other key material on the machine running it.
 */

const [outDir] = process.argv.slice(2);

if (!outDir) {
  console.error("Usage: generate-offline-verifier-fixture.ts <out-dir>");
  process.exit(2);
}

const keyId = "cross-language-fixture";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");

// Self-contained: this fixture's key material lives only in outDir,
// never in the repo's real PARMANA_KEY_DIR.
process.env.PARMANA_KEY_DIR = outDir;
process.env.PARMANA_VERIFICATION_KEY_ID = keyId;
// loadConfig() refuses to start without a policy directory even though this
// fixture never loads a policy. Point it at outDir so the script is
// self-contained and does not depend on a repo .env (CI has none).
process.env.PARMANA_POLICY_DIR = outDir;

writeFileSync(
  `${outDir}/${keyId}.private.pem`,
  privateKey.export({ format: "pem", type: "pkcs8" }),
);

writeFileSync(
  `${outDir}/${keyId}.public.pem`,
  publicKey.export({ format: "pem", type: "spki" }),
);

const crypto = new VerificationCrypto();

const draft = {
  trustRecordId: "cross-language-fixture-txn",
  businessTransactionId: "cross-language-fixture-txn",
  transaction: {
    businessTransactionId: "cross-language-fixture-txn",
    status: "RECEIVED",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    signals: { amount: 100, vendorId: "vendor-café" },
  },
  overrides: [],
  executions: [],
  verifications: [],
  receipts: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
} as unknown as ExecutionTrustRecord;

const trustRecordHash = await crypto.hash(draft);

const withHash: ExecutionTrustRecord = {
  ...draft,
  trustRecordHash,
  signature: { algorithm: "ed25519", keyId, value: "", signedAt: new Date() },
};

const signature = await crypto.sign(withHash);
const record: ExecutionTrustRecord = { ...withHash, signature };

writeFileSync(`${outDir}/record.json`, JSON.stringify(record, null, 2));
writeFileSync(
  `${outDir}/public-key.pem`,
  publicKey.export({ format: "pem", type: "spki" }),
);

//
// A second, LARGE record signed the way the KMS Signer signs a message over
// 4096 bytes: as a fixed size commitment (see SignatureCommitment.ts), not
// the raw canonical bytes. It exercises the exact ArtifactSigner path
// VerificationCrypto.sign() uses, with a Signer that mirrors KmsSigner.sign()
// and enforces AWS KMS's 4096 byte raw limit, so this proves the Python
// verifier independently accepts a commitment signature. Written to
// record-large.json and verified by the same public key.
//
const largeDraft = {
  ...draft,
  trustRecordId: "cross-language-fixture-large",
  businessTransactionId: "cross-language-fixture-large",
  transaction: {
    ...(draft as unknown as { transaction: object }).transaction,
    businessTransactionId: "cross-language-fixture-large",
    signals: {
      amount: 100,
      vendorId: "vendor-café",
      evidence: "connector evidence ".repeat(600),
    },
  },
} as unknown as ExecutionTrustRecord;

const largeHash = await crypto.hash(largeDraft);

const largeWithHash: ExecutionTrustRecord = {
  ...largeDraft,
  trustRecordHash: largeHash,
  signature: { algorithm: "ed25519", keyId, value: "", signedAt: new Date() },
};

const kmsLikeSigner = {
  async sign(_keyId: string, data: Uint8Array): Promise<string> {
    const message = requiresCommitment(data) ? commitmentMessage(data) : data;

    if (message.length > KMS_RAW_MESSAGE_LIMIT_BYTES) {
      throw new Error("Member must have length less than or equal to 4096");
    }

    return nodeSign(null, Buffer.from(message), privateKey).toString("base64");
  },
} as unknown as Signer;

const largeCanonical = canonicalExecutionTrustRecord(largeWithHash);

if (!requiresCommitment(new CanonicalSerializer().serialize(largeCanonical))) {
  throw new Error("Large fixture is not over the KMS raw message limit.");
}

const largeSignatureValue = await new ArtifactSigner(
  CryptoBootstrap.create(),
).signWithSigner(largeCanonical, keyId, kmsLikeSigner);

const largeRecord: ExecutionTrustRecord = {
  ...largeWithHash,
  signature: {
    algorithm: "ed25519",
    keyId,
    value: largeSignatureValue,
    signedAt: new Date(),
  },
};

writeFileSync(
  `${outDir}/record-large.json`,
  JSON.stringify(largeRecord, null, 2),
);

console.log(`Fixture written to ${outDir}`);
