/**
 * Verifies a signed release from Parmana at an external connector
 * endpoint (ADR-0013).
 *
 * When an operator registers an external connector, Parmana releases
 * every approved request for that capability to the endpoint as
 * `{ release, signature }`. Before acting, the endpoint calls
 * verifyParmanaRelease with the body, Parmana's public key (get it once
 * with `client.publicKey("default")`), its own URL as registered, and a
 * callback that says whether it already executed a businessTransactionId.
 *
 * Python counterpart: parmana/crypto/release.py, verify_parmana_release,
 * with the same checks in the same order and the same error texts. No
 * network call, no disk read.
 */

import { createHash, createPublicKey, verify } from "node:crypto";

import { canonicalSerialize } from "./canonical.js";
import type { PublicKeys } from "./offline-verifier.js";

/**
 * How far the endpoint's clock may be behind Parmana's before an expired
 * release is refused, in seconds.
 */
export const DEFAULT_RELEASE_CLOCK_SKEW_SECONDS = 30;

const KMS_RAW_MESSAGE_LIMIT_BYTES = 4096;

const COMMITMENT_PREFIX = Buffer.from(
  "PARMANA-ED25519-LARGE-MESSAGE-V1\0",
  "utf8",
);

/**
 * What Parmana approved and released. Act on capability, target and
 * parameters only.
 */
export interface ParmanaRelease {
  readonly version: 1;
  readonly connectorId: string;
  readonly audience: string;
  readonly businessTransactionId: string;
  readonly authorizationId: string;
  readonly capability: string;
  readonly target: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly policy: {
    readonly name: string;
    readonly version: string;
    readonly contentHash?: string;
  };
  readonly approvedBy: readonly {
    readonly approverId: string;
    readonly keyId: string;
    readonly approvalId: string;
  }[];
  readonly issuedAt: string;
  readonly expiresAt: string;

  /**
   * The business facts the release rests on (RFC-0023 phase 4), each
   * with the value its source gave and until when it holds. Act only if
   * each still holds in your records, in the same transaction as the
   * action; otherwise answer `success: false` with
   * `conditionsNotMet: true`. Absent when the decision sourced no facts.
   * Covered by the signature, like every other field.
   */
  readonly conditions?: readonly ParmanaReleaseCondition[];
}

export interface ParmanaReleaseCondition {
  readonly signalKey: string;
  readonly source: string;
  readonly claim: string;
  readonly subject: string;
  readonly value: unknown;
  readonly validUntil: string;
}

export interface VerifyParmanaReleaseOptions {
  /**
   * Key ID to PEM public key. The release names its key in
   * signature.keyId, usually `default`.
   */
  readonly publicKeys: PublicKeys;

  /**
   * This endpoint's URL exactly as Parmana stored it at registration
   * (GET /external-connectors shows it). A release made for another
   * endpoint is refused.
   */
  readonly audience: string;

  /**
   * Whether this endpoint already executed the businessTransactionId.
   * Keep that record durably: Parmana may send the same release again
   * after a timeout, and the endpoint must answer with its first result,
   * not act twice. Called only for a release that passed every other
   * check.
   */
  readonly isAlreadyExecuted: (
    businessTransactionId: string,
  ) => boolean | Promise<boolean>;

  /**
   * Defaults to the current time.
   */
  readonly now?: Date;

  /**
   * Defaults to DEFAULT_RELEASE_CLOCK_SKEW_SECONDS.
   */
  readonly clockSkewSeconds?: number;
}

export type ParmanaReleaseVerification =
  | {
      readonly valid: true;
      readonly release: ParmanaRelease;

      /**
       * True: answer with the result you stored the first time, and do
       * not act again.
       */
      readonly alreadyExecuted: boolean;
      readonly errors: readonly [];
    }
  | {
      readonly valid: false;

      /**
       * Every failed check, in plain words, in the order checked:
       * shape, signature, audience, expiry.
       */
      readonly errors: readonly string[];
    };

type JsonObject = Readonly<Record<string, unknown>>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shapeErrors(release: JsonObject): string[] {
  const errors: string[] = [];

  if (release.version !== 1) {
    errors.push("release.version is not 1");
  }

  for (const field of [
    "connectorId",
    "audience",
    "businessTransactionId",
    "authorizationId",
    "capability",
    "target",
    "issuedAt",
    "expiresAt",
  ]) {
    if (typeof release[field] !== "string") {
      errors.push(`release.${field} is not a string`);
    }
  }

  if (!isObject(release.parameters)) {
    errors.push("release.parameters is not an object");
  }

  if (!isObject(release.policy)) {
    errors.push("release.policy is not an object");
  }

  if (!Array.isArray(release.approvedBy)) {
    errors.push("release.approvedBy is not an array");
  }

  return errors;
}

function signatureVerifies(
  publicKeyPem: string,
  signature: Buffer,
  message: Uint8Array,
): boolean {
  const publicKey = createPublicKey(publicKeyPem);

  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error("the public key for signature.keyId is not an Ed25519 key");
  }

  if (verify(null, message, publicKey, signature)) {
    return true;
  }

  // Above 4096 bytes, a KMS signed release signs a SHA-512 commitment of
  // the canonical bytes instead (docs/adr/ADR-0010).
  if (message.length <= KMS_RAW_MESSAGE_LIMIT_BYTES) {
    return false;
  }

  return verify(
    null,
    Buffer.concat([
      COMMITMENT_PREFIX,
      createHash("sha512").update(message).digest(),
    ]),
    publicKey,
    signature,
  );
}

/**
 * Checks, in order: the body's shape, the signature over the canonical
 * JSON of `release` with the key named in signature.keyId, that
 * release.audience equals `audience`, and that release.expiresAt has not
 * passed (with the clock skew allowance). Only then does it ask
 * isAlreadyExecuted. Never throws for a bad body; returns
 * `{ valid: false, errors }`.
 */
export async function verifyParmanaRelease(
  body: unknown,
  options: VerifyParmanaReleaseOptions,
): Promise<ParmanaReleaseVerification> {
  if (!isObject(body) || !isObject(body.release) || !isObject(body.signature)) {
    return {
      valid: false,
      errors: ["the body is not { release, signature }"],
    };
  }

  const { release, signature } = body;
  const errors = shapeErrors(release);

  if (signature.algorithm !== "ed25519") {
    errors.push(
      `signature.algorithm ${JSON.stringify(signature.algorithm ?? null)} is not supported; only ed25519 is`,
    );
  } else if (
    typeof signature.keyId !== "string" ||
    typeof signature.value !== "string"
  ) {
    errors.push("signature.keyId or signature.value is not a string");
  } else {
    const publicKeyPem = options.publicKeys[signature.keyId];

    if (publicKeyPem === undefined) {
      errors.push(`no public key supplied for keyId ${signature.keyId}`);
    } else {
      try {
        if (
          !signatureVerifies(
            publicKeyPem,
            Buffer.from(signature.value, "base64"),
            canonicalSerialize(release),
          )
        ) {
          errors.push("the signature does not verify");
        }
      } catch (error) {
        errors.push(
          `the signature could not be checked: ${(error as Error).message}`,
        );
      }
    }
  }

  if (release.audience !== options.audience) {
    errors.push(
      `release.audience ${JSON.stringify(release.audience ?? null)} is not this endpoint (${options.audience})`,
    );
  }

  const expiresAt =
    typeof release.expiresAt === "string"
      ? Date.parse(release.expiresAt)
      : Number.NaN;
  const now = (options.now ?? new Date()).getTime();
  const skewMs =
    (options.clockSkewSeconds ?? DEFAULT_RELEASE_CLOCK_SKEW_SECONDS) * 1000;

  if (Number.isNaN(expiresAt)) {
    errors.push("release.expiresAt is not a date");
  } else if (now > expiresAt + skewMs) {
    errors.push(`the release expired at ${String(release.expiresAt)}`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const verified = release as unknown as ParmanaRelease;

  return {
    valid: true,
    release: verified,
    alreadyExecuted: await options.isAlreadyExecuted(
      verified.businessTransactionId,
    ),
    errors: [],
  };
}
