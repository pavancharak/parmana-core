/**
 * Generates the schema version 3 vectors that parmana-verifier tests against
 * (test/vectors/parmana-core-generated/ in that repository), signed by the
 * server's own signing code (VerificationCrypto), not by hand.
 *
 * Usage:
 *   npx tsx scripts/generate-verifier-vectors.ts <hybrid|single> <out-dir>
 *
 * Writes <out-dir>/record.json (the signed record) and <out-dir>/trust.json
 * (public keys only). Ephemeral keys are written to <out-dir> as PEM files
 * named *.private.pem. Never commit <out-dir>: the script refuses any
 * directory inside this repository, so private keys cannot be written here.
 *
 * Modes:
 *   hybrid  two entries (Ed25519 and ML-DSA-65); trust file sets
 *           hybridRequiredFrom 2026-01-01T00:00:00.000Z.
 *   single  one Ed25519 entry; no cutover in the trust file.
 *
 * The record and key ids are fixed so that the verifier's cases.json can
 * name them. Changing either requires updating that file.
 *
 * Not a running server: this calls the same signing code the server calls,
 * with configuration set in this process.
 */
import { generateKeyPairSync, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [mode, outArg] = process.argv.slice(2);

if ((mode !== "hybrid" && mode !== "single") || !outArg) {
  console.error("Usage: generate-verifier-vectors.ts <hybrid|single> <out-dir>");
  process.exit(2);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(outArg);

if (outDir === repoRoot || outDir.startsWith(repoRoot + path.sep)) {
  console.error(
    `Refusing to write ${outDir}: it is inside the repository, and this script writes private keys. Use a directory outside the repository.`,
  );
  process.exit(2);
}

mkdirSync(outDir, { recursive: true });

const hybrid = mode === "hybrid";
const edKeyId = hybrid ? "whole-record-ed" : "single-record-ed";
const mlKeyId = "whole-record-ml";

const ed = generateKeyPairSync("ed25519");
const ml = hybrid ? generateKeyPairSync("ml-dsa-65") : undefined;

writeFileSync(`${outDir}/${edKeyId}.private.pem`, ed.privateKey.export({ format: "pem", type: "pkcs8" }));
writeFileSync(`${outDir}/${edKeyId}.public.pem`, ed.publicKey.export({ format: "pem", type: "spki" }));
if (ml) {
  writeFileSync(`${outDir}/${mlKeyId}.private.pem`, ml.privateKey.export({ format: "pem", type: "pkcs8" }));
  writeFileSync(`${outDir}/${mlKeyId}.public.pem`, ml.publicKey.export({ format: "pem", type: "spki" }));
}

// Configuration the server reads from the environment, set before the signing modules load it.
process.env.PARMANA_KEY_DIR = outDir;
process.env.PARMANA_POLICY_DIR = outDir;
process.env.PARMANA_VERIFICATION_KEY_ID = edKeyId;
process.env.CRYPTO_MODE = hybrid ? "hybrid" : "single";
process.env.PRIMARY_SIGNATURE_PROVIDER = "ed25519";
if (hybrid) {
  process.env.PARMANA_VERIFICATION_SECONDARY_KEY_ID = mlKeyId;
  process.env.SECONDARY_SIGNATURE_PROVIDER = "ml-dsa-65";
  process.env.HYBRID_SCHEMA_VERSION = "3";
  process.env.HYBRID_SCHEMA_V3_ACKNOWLEDGED = "true";
} else {
  process.env.SECONDARY_SIGNATURE_PROVIDER = "";
  process.env.HYBRID_SCHEMA_VERSION = "";
}

const { VerificationCrypto } = await import("@parmana/crypto");

const crypto = new VerificationCrypto();

const at = hybrid ? "2026-03-01T00:00:00.000Z" : "2026-11-21T00:00:00.000Z";
const id = hybrid ? "whole-record-v3-fixture" : "single-record-v3-fixture";

const draft = {
  trustRecordId: id,
  businessTransactionId: id,
  transaction: {
    businessTransactionId: id,
    status: "RECEIVED",
    createdAt: new Date(at),
    signals: { amount: 100 },
  },
  overrides: [],
  executions: [],
  createdAt: new Date(at),
  updatedAt: new Date(at),
  schemaVersion: 3,
} as never;

const trustRecordHash = await crypto.hash(draft);
// Schema version 3 has no legacy signature: the signatures array covers the whole record (D24).
const signatures = await crypto.signWholeRecord({ ...draft, trustRecordHash } as never);

const record = { ...draft, trustRecordHash, signatures };
writeFileSync(`${outDir}/record.json`, JSON.stringify(record, null, 2));

const pubPem = (key: { publicKey: { export: (o: object) => unknown } }) =>
  String(key.publicKey.export({ format: "pem", type: "spki" }));
const fingerprint = (key: { publicKey: { export: (o: object) => Buffer } }) =>
  "sha256:" +
  createHash("sha256")
    .update(key.publicKey.export({ format: "der", type: "spki" }))
    .digest("hex");

const keys = [
  {
    keyId: edKeyId,
    algorithm: "ed25519",
    publicKeyPem: pubPem(ed),
    fingerprint: fingerprint(ed),
    validFrom: "2000-01-01T00:00:00.000Z",
    validUntil: null,
    compromised: false,
  },
  ...(ml
    ? [
        {
          keyId: mlKeyId,
          algorithm: "dilithium3",
          publicKeyPem: pubPem(ml),
          fingerprint: fingerprint(ml),
          validFrom: "2000-01-01T00:00:00.000Z",
          validUntil: null,
          compromised: false,
        },
      ]
    : []),
];

const trust = {
  note: `Generated by scripts/generate-verifier-vectors.ts (${mode}) in parmana-core. Test keys, not production keys.`,
  ...(hybrid ? { hybridRequiredFrom: "2026-01-01T00:00:00.000Z" } : {}),
  keys,
};

writeFileSync(`${outDir}/trust.json`, JSON.stringify(trust, null, 2));

console.log(
  `wrote ${outDir}/record.json and ${outDir}/trust.json (${mode}, schemaVersion 3, ${signatures.length} signature entr${signatures.length === 1 ? "y" : "ies"}); private keys are in ${outDir} and must not be committed`,
);
