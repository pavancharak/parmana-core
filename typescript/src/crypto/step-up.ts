/**
 * Signs a policy governance step up authorization on the approver's own
 * machine. The result is accepted by POST /policies/pending-changes/{id}/
 * approve and .../reject exactly as one made by the server's
 * PolicyChangeStepUpAuthorizationSigner (packages/crypto/src/
 * PolicyChangeStepUpAuthorizationCrypto.ts): the same payload, the same
 * canonical JSON, the same Ed25519 signature.
 *
 * The private key never leaves the process that calls this function.
 */

import { createPrivateKey, randomUUID, sign } from "node:crypto";

import type {
  PolicyChangeStepUpAuthorization,
  PolicyChangeStepUpAuthorizationPayload,
} from "../models/policy-change.js";

import { canonicalSerialize } from "./canonical.js";

export interface SignPolicyChangeStepUpInput {
  /**
   * The change to approve or reject.
   */
  readonly pendingPolicyChangeId: string;

  readonly action: "approve" | "reject";

  /**
   * The approver's Ed25519 step up private key, PEM (PKCS #8), as made by
   * `openssl genpkey -algorithm ed25519`.
   */
  readonly privateKeyPem: string;

  /**
   * A label for the key. It is recorded with the authorization; the server
   * verifies with the public key registered on the approver's API key, not
   * by this label.
   */
  readonly keyId: string;

  /**
   * How long the authorization stays valid. Default 120.
   */
  readonly ttlSeconds?: number;
}

const DEFAULT_TTL_SECONDS = 120;

/**
 * Signs a step up authorization for one decision (approve or reject) on one
 * change: a policy, an approver or an external connector. Valid for
 * ttlSeconds (default 120) and usable once. Run by the checker, with their
 * own step up private key.
 */
export function signPolicyChangeStepUp(
  input: SignPolicyChangeStepUpInput,
): PolicyChangeStepUpAuthorization {
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error(`Invalid step up authorization TTL: ${ttlSeconds}`);
  }

  if (input.action !== "approve" && input.action !== "reject") {
    throw new Error('action must be "approve" or "reject".');
  }

  const privateKey = createPrivateKey(input.privateKeyPem);

  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("the step up private key must be an Ed25519 key.");
  }

  const authorizedAt = new Date();
  const expiresAt = new Date(authorizedAt.getTime() + ttlSeconds * 1000);

  const payload: PolicyChangeStepUpAuthorizationPayload = {
    version: 1,
    nonce: randomUUID(),
    pendingPolicyChangeId: input.pendingPolicyChangeId,
    action: input.action,
    authorizedAt: authorizedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const signature = sign(null, canonicalSerialize(payload), privateKey);

  return {
    payload,
    signature: signature.toString("base64"),
    keyId: input.keyId,
    algorithm: "ed25519",
  };
}
