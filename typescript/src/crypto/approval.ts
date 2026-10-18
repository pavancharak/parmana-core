/**
 * Signs an Approval Artifact on the approver's own machine: one approver
 * approving one action on one resource, optionally up to an amount, for a
 * limited time, once. The result is accepted by any policy that declares
 * approvalSignals exactly as one made by the server's
 * ApprovalArtifactSigner (packages/crypto/src/ApprovalArtifactCrypto.ts)
 * or scripts/sign-approval.ts: the same payload, the same canonical JSON,
 * the same Ed25519 signature.
 *
 * The agent sends it in the signal the policy names (by default
 * signals.approvalArtifact), with the approval signal set to true.
 *
 * The private key never leaves the process that calls this function.
 */

import { createPrivateKey, randomUUID, sign } from "node:crypto";

import { canonicalSerialize } from "./canonical.js";

export type ApprovalScopeComparator =
  "eq" | "lte" | "gte" | "lt" | "gt" | "between";

export interface ApprovalScope {
  readonly field: string;
  readonly comparator: ApprovalScopeComparator;
  readonly value:
    number | string | { readonly min: number; readonly max: number };
}

export interface ApprovalPayload {
  readonly version: 1;
  readonly approvalId: string;
  readonly issuer: { readonly approverId: string; readonly keyId: string };
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly capability: string;
  readonly resourceId: string;
  readonly scope: ApprovalScope;
  readonly nonce: string;
}

export interface SignedApproval {
  readonly payload: ApprovalPayload;
  readonly signature: {
    readonly algorithm: "ed25519";
    readonly keyId: string;
    readonly value: string;
    readonly signedAt: string;
  };
}

export interface SignApprovalInput {
  /**
   * The approver's Ed25519 private key, PEM (PKCS #8), as made by
   * scripts/generate-approver-key.ts.
   */
  readonly privateKeyPem: string;

  /**
   * The approver and key as registered on the server.
   */
  readonly approverId: string;
  readonly keyId: string;

  /**
   * The action approved, such as paytm:refund or github:pr-merge.
   */
  readonly capability: string;

  /**
   * The value at the policy's approvalSignals resourceId path: an order
   * id, or for "target" the Intent's target, such as acme/api#42.
   */
  readonly resourceId: string;

  /**
   * The largest amount approved. Give it when the policy declares a value
   * path (an amount), and leave it out when it does not: the approval then
   * names exactly this resource.
   */
  readonly maxAmount?: number;

  /**
   * How long the approval stays valid. Default 900, at most 86400.
   */
  readonly ttlSeconds?: number;
}

export const DEFAULT_APPROVAL_TTL_SECONDS = 900;
export const MAX_APPROVAL_TTL_SECONDS = 86_400;

const CAPABILITY = /^[A-Za-z0-9_-]+:[A-Za-z0-9_.-]+$/;

/**
 * Signs an approval for one action on one resource, optionally up to an
 * amount, valid for ttlSeconds (default 900, at most 86400) and usable once.
 * Run by the approver, with their own private key.
 */
export function signApproval(input: SignApprovalInput): SignedApproval {
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_APPROVAL_TTL_SECONDS;

  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds <= 0 ||
    ttlSeconds > MAX_APPROVAL_TTL_SECONDS
  ) {
    throw new Error(
      `ttlSeconds must be a whole number from 1 to ${MAX_APPROVAL_TTL_SECONDS}.`,
    );
  }

  if (!CAPABILITY.test(input.capability)) {
    throw new Error(
      `capability must be an action such as paytm:refund or github:pr-merge: ${input.capability}`,
    );
  }

  if (input.resourceId.length === 0) {
    throw new Error("resourceId must not be empty.");
  }

  if (
    input.maxAmount !== undefined &&
    (!Number.isFinite(input.maxAmount) || input.maxAmount <= 0)
  ) {
    throw new Error("maxAmount must be a positive number.");
  }

  const privateKey = createPrivateKey(input.privateKeyPem);

  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("the approver private key must be an Ed25519 key.");
  }

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);

  const scope: ApprovalScope =
    input.maxAmount !== undefined
      ? { field: "value", comparator: "lte", value: input.maxAmount }
      : { field: "resourceId", comparator: "eq", value: input.resourceId };

  const payload: ApprovalPayload = {
    version: 1,
    approvalId: randomUUID(),
    issuer: { approverId: input.approverId, keyId: input.keyId },
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    capability: input.capability,
    resourceId: input.resourceId,
    scope,
    nonce: randomUUID(),
  };

  const signature = sign(null, canonicalSerialize(payload), privateKey);

  return {
    payload,
    signature: {
      algorithm: "ed25519",
      keyId: input.keyId,
      value: signature.toString("base64"),
      signedAt: issuedAt.toISOString(),
    },
  };
}
