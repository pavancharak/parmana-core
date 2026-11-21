/**
 * Offline verification of Execution Trust Records and Execution Intents.
 *
 * TypeScript counterpart of the Python SDK's parmana/crypto/
 * offline_verifier.py, with the same checks and the same result fields in
 * camelCase. No network call, no disk read, no environment variable: only
 * the record and the public keys you pass in. Get a deployment's public key
 * once with `client.publicKey("default")` and keep it.
 *
 * Supports Ed25519, including the large message commitment AWS KMS uses for
 * a canonical form over 4096 bytes (docs/internal/adr/ADR-0010). A hybrid
 * record (a `signatures` array with one Ed25519 and one ML-DSA-65 entry) is
 * verified in full, including the schema version 3 whole-record message.
 * Needs Node 24 or later with OpenSSL 3.5 or later for ML-DSA-65.
 */

import { createHash, createPublicKey, verify } from "node:crypto";

import { canonicalSerialize } from "./canonical.js";

const SUPPORTED_ALGORITHMS = new Set(["ed25519"]);

const KMS_RAW_MESSAGE_LIMIT_BYTES = 4096;

const COMMITMENT_PREFIX = Buffer.from(
  "PARMANA-ED25519-LARGE-MESSAGE-V1\0",
  "utf8",
);

/**
 * The result of an offline verification.
 */
export interface OfflineVerificationResult {
  /**
   * True only when the hash matches and the signatures verify. For a trust record, the signatures
   * array must verify, and from the cutover on it must carry both hybrid signatures. For an
   * execution intent, its signature must verify.
   */
  readonly valid: boolean;

  /**
   * Whether the trust record's `signatures` array verifies. Set for trust records only.
   */
  readonly hybridSignaturesValid?: boolean | undefined;

  /**
   * The record's own hash matches a fresh SHA-256 of its canonical form.
   */
  readonly hashValid: boolean;

  readonly algorithmsChecked: readonly string[];

  /**
   * Why verification failed, in plain words. Empty when valid.
   */
  readonly errors: readonly string[];
}

/**
 * Maps a key ID (the record's `signature.keyId`, usually `default`) to that
 * key's PEM public key.
 */
export type PublicKeys = Readonly<Record<string, string>>;

type JsonObject = Readonly<Record<string, unknown>>;

function pick(record: JsonObject, fields: readonly string[]): JsonObject {
  const picked: Record<string, unknown> = {};

  for (const field of fields) {
    if (field in record) {
      picked[field] = record[field];
    }
  }

  return picked;
}

const TRUST_RECORD_FIELDS = [
  "trustRecordId",
  "businessTransactionId",
  "transaction",
  "authorization",
  "overrides",
  "executions",
  "createdAt",
] as const;

const INTENT_FIELDS = [
  "intentId",
  "businessTransactionId",
  "decisionId",
  "authorizationId",
  "policyName",
  "policyVersion",
  "policyContentHash",
  "signalsHash",
  "businessTransactionHash",
  "action",
  "target",
  "submittedBy",
  "grantedCapability",
  "createdAt",
] as const;

function verifyEd25519(
  publicKeyPem: string,
  signature: Buffer,
  message: Uint8Array,
): boolean {
  const publicKey = createPublicKey(publicKeyPem);

  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error("supplied public key is not an Ed25519 key");
  }

  if (verify(null, message, publicKey, signature)) {
    return true;
  }

  // A message over the KMS limit may have been signed as a commitment.
  if (message.length <= KMS_RAW_MESSAGE_LIMIT_BYTES) {
    return false;
  }

  const commitment = Buffer.concat([
    COMMITMENT_PREFIX,
    createHash("sha512").update(message).digest(),
  ]);

  return verify(null, commitment, publicKey, signature);
}

const WHOLE_RECORD_SCHEMA_VERSION = 3;

// Top-level fields a schema version 3 message does not cover.
const WHOLE_RECORD_EXCLUDED_FIELDS = new Set<string>([
  "signature",
  "signatures",
  "schemaVersion",
  "verifications",
  "receipts",
]);

/**
 * The message a hybrid `signatures` entry signs, mirroring
 * hybridSignedCanonicalView() in packages/crypto. Version 3 covers every
 * top-level field except the excluded ones; other versions cover the fixed
 * canonical fields. The schema version is always part of the message.
 */
function hybridMessage(record: JsonObject, schemaVersion: number): Uint8Array {
  if (schemaVersion === WHOLE_RECORD_SCHEMA_VERSION) {
    const covered: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      if (!WHOLE_RECORD_EXCLUDED_FIELDS.has(key)) {
        covered[key] = value;
      }
    }

    return canonicalSerialize({ ...covered, schemaVersion });
  }

  return canonicalSerialize({
    ...pick(record, TRUST_RECORD_FIELDS),
    schemaVersion,
  });
}

/**
 * Verifies a schema version 3 `signatures` array (decision D24). One or two entries, each for an
 * algorithm this verifier supports (ed25519 or dilithium3), no algorithm repeated, and every entry
 * verifying over `message` with the key its keyId names. Any other shape is a failure.
 */
function verifyEnvelope(
  entries: unknown,
  message: Uint8Array,
  publicKeys: PublicKeys,
  algorithmsChecked: string[],
  errors: string[],
): boolean {
  if (
    !Array.isArray(entries) ||
    !entries.every((e) => typeof e === "object" && e !== null)
  ) {
    errors.push("malformed signatures: expected a list of entries.");
    return false;
  }

  const names = entries.map((e) => String((e as JsonObject).algorithm));

  if (entries.length < 1 || entries.length > 2) {
    errors.push(
      `signatures must have one or two entries, got ${entries.length}.`,
    );
    return false;
  }

  if (
    names.some((name) => name !== "ed25519" && name !== "dilithium3") ||
    new Set(names).size !== names.length
  ) {
    errors.push(
      `signatures must name each algorithm at most once, from ed25519 and dilithium3, got [${names.join(", ")}].`,
    );
    return false;
  }

  let allValid = true;

  for (const entry of entries as readonly JsonObject[]) {
    const algorithm = String(entry.algorithm);
    const keyId = entry.keyId;
    const value = entry.signature ?? entry.value;

    algorithmsChecked.push(algorithm);

    if (typeof keyId !== "string" || !(keyId in publicKeys)) {
      errors.push(`no public key supplied for keyId "${String(keyId)}".`);
      allValid = false;
      continue;
    }

    try {
      if (typeof value !== "string") {
        throw new Error("signature value is missing or not a string");
      }

      const signature = Buffer.from(value, "base64");
      const pem = publicKeys[keyId] as string;

      const ok =
        algorithm === "ed25519"
          ? verifyEd25519(pem, signature, message)
          : verifyMlDsa65(pem, signature, message);

      if (!ok) {
        errors.push(
          `signature verification failed for keyId "${keyId}" (${algorithm}).`,
        );
        allValid = false;
      }
    } catch (error) {
      errors.push(
        `error verifying keyId "${keyId}" (${algorithm}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      allValid = false;
    }
  }

  return allValid;
}

/** ML-DSA-65 verification. Needs Node 24+ with OpenSSL 3.5+. */
function verifyMlDsa65(
  publicKeyPem: string,
  signature: Buffer,
  message: Uint8Array,
): boolean {
  const publicKey = createPublicKey(publicKeyPem);

  if (publicKey.asymmetricKeyType !== "ml-dsa-65") {
    throw new Error("supplied public key is not an ML-DSA-65 key");
  }

  return verify(null, message, publicKey, signature);
}

function verifySigned(
  artifact: JsonObject,
  fields: readonly string[],
  hashField: "trustRecordHash" | "intentHash",
  publicKeys: PublicKeys,
): {
  hashValid: boolean;
  signatureValid: boolean;
  algorithmsChecked: string[];
  errors: string[];
} {
  const errors: string[] = [];
  const algorithmsChecked: string[] = [];

  const canonical = canonicalSerialize(pick(artifact, fields));
  const expectedHash = createHash("sha256").update(canonical).digest("hex");
  const hashValid = expectedHash === artifact[hashField];

  if (!hashValid) {
    errors.push(
      `${hashField} mismatch: expected ${expectedHash}, got ${String(artifact[hashField])}.`,
    );
  }

  const signature = (artifact.signature ?? {}) as JsonObject;
  const algorithm = signature.algorithm;
  const keyId = signature.keyId;
  const value = signature.value;

  let signatureValid = false;

  if (typeof algorithm !== "string" || !SUPPORTED_ALGORITHMS.has(algorithm)) {
    errors.push(`unsupported algorithm: ${String(algorithm)}.`);
  } else if (typeof keyId !== "string" || !(keyId in publicKeys)) {
    errors.push(`no public key supplied for keyId "${String(keyId)}".`);
  } else {
    algorithmsChecked.push(algorithm);

    try {
      if (typeof value !== "string") {
        throw new Error("signature.value is missing or not a string");
      }

      signatureValid = verifyEd25519(
        publicKeys[keyId] as string,
        Buffer.from(value, "base64"),
        canonical,
      );

      if (!signatureValid) {
        errors.push(
          `signature verification failed for keyId "${keyId}" (${algorithm}).`,
        );
      }
    } catch (error) {
      errors.push(
        `error verifying keyId "${keyId}" (${algorithm}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return { hashValid, signatureValid, algorithmsChecked, errors };
}

/**
 * Verifies an Execution Trust Record with only public keys.
 *
 * @param trustRecord The record exactly as `client.trustRecord()` or
 *   `GET /trust-records/{id}` returned it, or as parsed from a JSON file.
 * @param publicKeys Key ID to PEM public key.
 */
/** Options for verifyExecutionTrustRecordOffline. */
export interface VerifyTrustRecordOptions {
  /**
   * The cutover (ADR-0016), an ISO-8601 UTC timestamp ending in "Z". A record created at or after it
   * must carry both hybrid signatures. Before it, one valid signature is accepted.
   */
  readonly hybridRequiredFrom?: string;
}

export function verifyExecutionTrustRecordOffline(
  trustRecord: unknown,
  publicKeys: PublicKeys,
  options: VerifyTrustRecordOptions = {},
): OfflineVerificationResult {
  const record = (trustRecord ?? {}) as JsonObject;
  const errors: string[] = [];
  const algorithmsChecked: string[] = [];

  const canonical = canonicalSerialize(pick(record, TRUST_RECORD_FIELDS));
  const expectedHash = createHash("sha256").update(canonical).digest("hex");
  const hashValid = expectedHash === record.trustRecordHash;

  if (!hashValid) {
    errors.push(
      `trustRecordHash mismatch: expected ${expectedHash}, got ${String(record.trustRecordHash)}.`,
    );
  }

  // Schema version 3 only (decision D24). The signatures array covers the whole record.
  let hybridValid = false;

  if (record.schemaVersion !== WHOLE_RECORD_SCHEMA_VERSION) {
    errors.push(
      `unsupported schemaVersion ${String(record.schemaVersion)}: only schemaVersion 3 is accepted (decision D24).`,
    );
  } else if (record.signatures === undefined || record.signatures === null) {
    errors.push(
      "schemaVersion 3 record has no signatures array: a whole-record signature is required.",
    );
  } else {
    hybridValid = verifyEnvelope(
      record.signatures,
      hybridMessage(record, WHOLE_RECORD_SCHEMA_VERSION),
      publicKeys,
      algorithmsChecked,
      errors,
    );
  }

  // From the cutover on, both hybrid signatures are required.
  if (
    options.hybridRequiredFrom !== undefined &&
    isAtOrAfterCutover(record.createdAt, options.hybridRequiredFrom)
  ) {
    const count = Array.isArray(record.signatures)
      ? record.signatures.length
      : 0;

    if (hybridValid && count !== 2) {
      errors.push(
        `record created at or after hybridRequiredFrom (${options.hybridRequiredFrom}) must carry both hybrid signatures.`,
      );
      hybridValid = false;
    }
  }

  return {
    valid: hashValid && hybridValid,
    hashValid,
    hybridSignaturesValid: hybridValid,
    algorithmsChecked,
    errors,
  };
}

/** True when createdAt is at or after the cutover (the instant itself is included). */
function isAtOrAfterCutover(createdAt: unknown, cutover: string): boolean {
  const created = typeof createdAt === "string" ? Date.parse(createdAt) : NaN;
  return !Number.isNaN(created) && created >= Date.parse(cutover);
}

/**
 * Verifies an Execution Intent with only public keys.
 *
 * A valid result proves the intent was signed by the holder of that key and
 * has not been altered. It does not prove the action was released, or what
 * its result was: an intent is written before release.
 *
 * @param intent The `intent` field of `client.executionIntent()` or
 *   `GET /execution-intents/{id}`.
 * @param publicKeys Key ID to PEM public key.
 */
export function verifyExecutionIntentOffline(
  intent: unknown,
  publicKeys: PublicKeys,
): OfflineVerificationResult {
  const result = verifySigned(
    (intent ?? {}) as JsonObject,
    INTENT_FIELDS,
    "intentHash",
    publicKeys,
  );

  return {
    valid: result.hashValid && result.signatureValid,
    hashValid: result.hashValid,
    algorithmsChecked: result.algorithmsChecked,
    errors: result.errors,
  };
}
