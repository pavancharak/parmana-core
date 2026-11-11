import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";

import { AuthorityType } from "@parmana/shared";

/** Re-exported so the CLI can name credential holder types without its own shared dependency. */
export { AuthorityType };

/**
 * Key generation shared by the repository scripts and the parmana-ops CLI.
 *
 * Nothing here writes to disk or prints. Callers own the output: the
 * scripts and the CLI decide where a secret goes, and show a raw key or a
 * step-up private key to the operator once.
 */

/** An API key entry in PARMANA_API_KEYS. Only the hash is ever stored. */
export interface GeneratedApiKeyEntry {
  callerId: string;
  keyHash: string;
  allowedPrincipalIds?: string[];
  allowedCapabilities?: string[];
  credentialHolderType?: AuthorityType;
  stepUpPublicKey?: string;
}

export interface GeneratedCallerKey {
  /** The raw key. Shown once; the server keeps only its hash. */
  readonly rawKey: string;
  readonly entry: GeneratedApiKeyEntry;
  /** PKCS8 PEM Ed25519 private key, present only with generateStepUpKey. */
  readonly stepUpPrivateKey?: string;
}

export interface GenerateCallerKeyOptions {
  readonly callerId: string;
  readonly allowedPrincipalIds?: readonly string[] | undefined;
  readonly allowedCapabilities?: readonly string[] | undefined;
  readonly credentialHolderType?: AuthorityType | undefined;
  /**
   * A separate Ed25519 key pair for step-up authorization, for a checker.
   * Requires credentialHolderType USER: a step-up key only means something
   * for a human-credentialed checker.
   */
  readonly generateStepUpKey?: boolean | undefined;
}

export interface GeneratedApproverKeyPair {
  /** PKCS8 PEM. Keep it with the approver. */
  readonly privateKeyPem: string;
  /** SPKI PEM. This is what the operator registers. */
  readonly publicKeyPem: string;
}

const API_KEY_HASH_PATTERN = /^[0-9a-f]{64}$/;

/**
 * An approver or key ID becomes part of a file name, so it must not contain
 * a path separator or anything a shell would interpret. Letters, digits, "."
 * "_" and "-"; no length limit is applied here beyond the file system's.
 */
export const APPROVER_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function generateCallerKey({
  callerId,
  allowedPrincipalIds,
  allowedCapabilities,
  credentialHolderType,
  generateStepUpKey,
}: GenerateCallerKeyOptions): GeneratedCallerKey {
  const normalizedCallerId = callerId.trim();

  if (!normalizedCallerId) {
    throw new Error("--caller-id must be a non-empty string.");
  }

  if (generateStepUpKey && credentialHolderType !== AuthorityType.USER) {
    throw new Error(
      "--generate-step-up-key requires --credential-holder-type USER: " +
        "step-up authorization only has meaning for a human-credentialed checker.",
    );
  }

  const normalizedPrincipalIds = allowedPrincipalIds
    ?.map((id) => id.trim())
    .filter(Boolean);

  const normalizedCapabilities = allowedCapabilities
    ?.map((capability) => capability.trim())
    .filter(Boolean);

  const rawKey = randomBytes(32).toString("base64url");
  const keyHash = createHash("sha256").update(rawKey, "utf8").digest("hex");

  if (!API_KEY_HASH_PATTERN.test(keyHash)) {
    throw new Error("Generated key hash has an invalid format.");
  }

  const entry: GeneratedApiKeyEntry = {
    callerId: normalizedCallerId,
    keyHash,
  };

  if (normalizedPrincipalIds && normalizedPrincipalIds.length > 0) {
    entry.allowedPrincipalIds = normalizedPrincipalIds;
  }

  if (normalizedCapabilities && normalizedCapabilities.length > 0) {
    entry.allowedCapabilities = normalizedCapabilities;
  }

  if (credentialHolderType !== undefined) {
    entry.credentialHolderType = credentialHolderType;
  }

  let stepUpPrivateKey: string | undefined;

  if (generateStepUpKey) {
    // A separate key pair, not derived from rawKey, so one leak does not
    // reveal the other.
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");

    entry.stepUpPublicKey = publicKey
      .export({ format: "pem", type: "spki" })
      .toString();

    stepUpPrivateKey = privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
  }

  return {
    rawKey,
    entry,
    ...(stepUpPrivateKey !== undefined ? { stepUpPrivateKey } : {}),
  };
}

/** Throws unless the approver ID and key ID are safe to use in a file name. */
export function assertSafeApproverIds(approverId: string, keyId: string): void {
  for (const [name, value] of [
    ["--approver-id", approverId],
    ["--key-id", keyId],
  ] as const) {
    if (!APPROVER_ID_PATTERN.test(value)) {
      throw new Error(
        `${name} must use only letters, digits, ".", "_" and "-": ${value}`,
      );
    }
  }
}

/** The file name stem for an approver key pair: `<approverId>__<keyId>`. */
export function approverKeyFileStem(approverId: string, keyId: string): string {
  assertSafeApproverIds(approverId, keyId);

  return `${approverId}__${keyId}`;
}

export function generateApproverKeyPair(): GeneratedApproverKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");

  return {
    privateKeyPem: privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString(),
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
}
