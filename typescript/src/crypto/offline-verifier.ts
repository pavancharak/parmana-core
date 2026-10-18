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
 * a canonical form over 4096 bytes (docs/adr/ADR-0010). A record that also
 * carries a hybrid `signatures` array (ML-DSA-65) is reported as not valid
 * here, the same as in the Python SDK, because that algorithm is not
 * verified by the SDKs.
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
   * True only when the hash matches and the signature verifies.
   */
  readonly valid: boolean;

  /**
   * The record's own hash matches a fresh SHA-256 of its canonical form.
   */
  readonly hashValid: boolean;

  /**
   * The Ed25519 signature verifies with the supplied public key.
   */
  readonly legacySignatureValid: boolean;

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
export function verifyExecutionTrustRecordOffline(
  trustRecord: unknown,
  publicKeys: PublicKeys,
): OfflineVerificationResult {
  const record = (trustRecord ?? {}) as JsonObject;
  const result = verifySigned(
    record,
    TRUST_RECORD_FIELDS,
    "trustRecordHash",
    publicKeys,
  );

  const hybrid =
    Array.isArray(record.signatures) && record.signatures.length > 0;

  if (hybrid) {
    result.errors.push(
      "this record carries a hybrid `signatures` array; ML-DSA-65 " +
        "verification is not available in the SDKs. Verify it with the " +
        "server's reference implementation (scripts/verify-trust-record.ts).",
    );
  }

  return {
    valid: result.hashValid && result.signatureValid && !hybrid,
    hashValid: result.hashValid,
    legacySignatureValid: result.signatureValid,
    algorithmsChecked: result.algorithmsChecked,
    errors: result.errors,
  };
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
    legacySignatureValid: result.signatureValid,
    algorithmsChecked: result.algorithmsChecked,
    errors: result.errors,
  };
}
