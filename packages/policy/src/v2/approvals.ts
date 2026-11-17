/**
 * Informed, exact, single-use approvals for policy version 2 (design 4.7).
 *
 * An approver is shown the whole request before signing: the action, the target,
 * every value with its provenance, and the caller's reason. The approver confirms
 * after reading. The signature covers a digest of exactly what was displayed, the
 * exact value approved, and a short validity. An approval is used once.
 *
 * Standalone. The runtime does not use it yet.
 */

import { createHash, sign, verify, type KeyObject } from "node:crypto";

import {
  canonicalize,
  MAX_CLOCK_SKEW_MS,
  readEd25519PublicKey,
  type NonceStore,
} from "./sourceAnswer.js";

/** The longest an approval may be valid (decision D11, platform cap). */
export const MAX_APPROVAL_VALIDITY_MINUTES = 60;

export type Scalar = string | number | boolean;

/** What the approver is shown. Its digest is what the approver confirms. */
export interface ApprovalView {
  readonly capability: string;
  readonly target: string;
  /** Every value, with its provenance and, for sourced values, its source and claim. */
  readonly values: Readonly<
    Record<
      string,
      {
        readonly value: Scalar;
        readonly provenance: string;
        readonly source?: string;
        readonly claim?: string;
      }
    >
  >;
  /** Values the request is missing. Shown so the approver sees what is not verified. */
  readonly missing: readonly string[];
  /** The caller's reason, as sent. */
  readonly callerReason: string;
}

export interface Confirmation {
  readonly digest: string;
  readonly confirmedAt: string;
  readonly approverId: string;
}

export interface ApprovalPayload {
  readonly capability: string;
  readonly signal: string;
  readonly resourceId: string;
  /** The exact value approved. Never a range. */
  readonly value: Scalar;
  readonly digest: string;
  readonly approverId: string;
  readonly keyId: string;
  readonly confirmedAt: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly nonce: string;
}

export interface SignedApproval {
  readonly payload: ApprovalPayload;
  readonly signature: string;
}

export type ApprovalRefusalCode =
  | "MALFORMED"
  | "UNKNOWN_APPROVER"
  | "REVOKED"
  | "BAD_SIGNATURE"
  | "NOT_CONFIRMED"
  | "MISMATCH"
  | "DIGEST_MISMATCH"
  | "NOT_YET_VALID"
  | "EXPIRED"
  | "TOO_LONG"
  | "REPLAYED";

/** The digest of what an approver is shown. The transaction id is not part of it, so an approval can be used on a retry under a new id. */
export function viewDigest(view: ApprovalView): string {
  return createHash("sha256").update(canonicalize(view)).digest("hex");
}

/** The registered approver keys. An approver's key can be revoked at once. */
export class ApproverKeys {
  private readonly keys = new Map<
    string,
    { publicKey: KeyObject; revoked: boolean }
  >();

  register(approverId: string, keyId: string, publicKeyPem: string): void {
    this.keys.set(`${approverId}/${keyId}`, {
      publicKey: readEd25519PublicKey(publicKeyPem),
      revoked: false,
    });
  }

  revoke(approverId: string, keyId: string): void {
    const entry = this.keys.get(`${approverId}/${keyId}`);
    if (entry !== undefined) entry.revoked = true;
  }

  keyFor(approverId: string, keyId: string): KeyObject | "revoked" | undefined {
    const entry = this.keys.get(`${approverId}/${keyId}`);
    if (entry === undefined) return undefined;
    return entry.revoked ? "revoked" : entry.publicKey;
  }
}

/**
 * Signs an approval for one value that the approver was shown. Refuses unless the
 * approver confirmed exactly the view being signed, the value is the one displayed,
 * and the validity is within the cap.
 */
export function signApproval(input: {
  readonly view: ApprovalView;
  readonly signal: string;
  readonly value: Scalar;
  readonly confirmation: Confirmation;
  readonly approverId: string;
  readonly keyId: string;
  readonly privateKey: KeyObject;
  readonly validityMinutes: number;
  readonly nonce: string;
  readonly now: Date;
}): SignedApproval {
  const digest = viewDigest(input.view);
  if (input.confirmation.digest !== digest) {
    throw new Error(
      "The request changed after it was shown. The approver must read it again.",
    );
  }
  if (input.confirmation.approverId !== input.approverId) {
    throw new Error("The confirmation was made by a different approver.");
  }
  const shown = input.view.values[input.signal];
  if (shown === undefined || shown.value !== input.value) {
    throw new Error(
      `The value approved for "${input.signal}" must be the one shown to the approver.`,
    );
  }
  if (
    !(input.validityMinutes > 0) ||
    input.validityMinutes > MAX_APPROVAL_VALIDITY_MINUTES
  ) {
    throw new Error(
      `The validity must be between 1 and ${MAX_APPROVAL_VALIDITY_MINUTES} minutes.`,
    );
  }
  const issued = input.now;
  const payload: ApprovalPayload = {
    capability: input.view.capability,
    signal: input.signal,
    resourceId: input.view.target,
    value: input.value,
    digest,
    approverId: input.approverId,
    keyId: input.keyId,
    confirmedAt: input.confirmation.confirmedAt,
    issuedAt: issued.toISOString(),
    expiresAt: new Date(
      issued.getTime() + input.validityMinutes * 60_000,
    ).toISOString(),
    nonce: input.nonce,
  };
  const signature = sign(
    null,
    Buffer.from(canonicalize(payload)),
    input.privateKey,
  ).toString("base64");
  return { payload, signature };
}

/** The expected approval: the signal, the resource and the exact value, as the decision reads them. */
export interface ApprovalExpectation {
  readonly signal: string;
  readonly capability: string;
  readonly resource: string;
  readonly value: Scalar;
  readonly now: Date;
  /** The digest of the view as it stands now. If given, the approval must match it. */
  readonly digest?: string;
}

function isPayload(value: unknown): value is ApprovalPayload {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  const strings = [
    "capability",
    "signal",
    "resourceId",
    "digest",
    "approverId",
    "keyId",
    "confirmedAt",
    "issuedAt",
    "expiresAt",
    "nonce",
  ];
  return (
    strings.every(
      (key) => typeof p[key] === "string" && (p[key] as string).length > 0,
    ) &&
    (typeof p["value"] === "string" ||
      typeof p["value"] === "number" ||
      typeof p["value"] === "boolean")
  );
}

/**
 * Verifies an approval. Checks run in this order, and the nonce is used last, so an
 * approval refused for another reason is not used up.
 */
export async function verifyApproval(
  artifact: unknown,
  expected: ApprovalExpectation,
  deps: { readonly approvers: ApproverKeys; readonly nonces: NonceStore },
): Promise<
  { ok: true } | { ok: false; code: ApprovalRefusalCode; reason: string }
> {
  const refuse = (code: ApprovalRefusalCode, reason: string) => ({
    ok: false as const,
    code,
    reason,
  });
  if (typeof artifact !== "object" || artifact === null)
    return refuse("MALFORMED", "The approval is not an object.");
  const { payload, signature } = artifact as {
    payload?: unknown;
    signature?: unknown;
  };
  if (typeof signature !== "string" || !isPayload(payload))
    return refuse("MALFORMED", "The approval is incomplete.");

  const key = deps.approvers.keyFor(payload.approverId, payload.keyId);
  if (key === undefined)
    return refuse(
      "UNKNOWN_APPROVER",
      `Approver "${payload.approverId}" with key "${payload.keyId}" is not registered.`,
    );
  if (key === "revoked")
    return refuse(
      "REVOKED",
      `Approver "${payload.approverId}" has been revoked.`,
    );

  let valid: boolean;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalize(payload)),
      key,
      Buffer.from(signature, "base64"),
    );
  } catch {
    valid = false;
  }
  if (!valid)
    return refuse(
      "BAD_SIGNATURE",
      "The signature does not verify with the approver's key.",
    );

  const confirmed = Date.parse(payload.confirmedAt);
  if (Number.isNaN(confirmed) || confirmed > Date.parse(payload.issuedAt)) {
    return refuse(
      "NOT_CONFIRMED",
      "The approver did not confirm before signing.",
    );
  }
  if (
    payload.capability !== expected.capability ||
    payload.signal !== expected.signal ||
    payload.resourceId !== expected.resource ||
    payload.value !== expected.value
  ) {
    return refuse(
      "MISMATCH",
      "The approval is for a different action, resource, signal or exact value.",
    );
  }
  if (expected.digest !== undefined && payload.digest !== expected.digest) {
    return refuse(
      "DIGEST_MISMATCH",
      "The request changed after the approver was shown it.",
    );
  }
  const issued = Date.parse(payload.issuedAt);
  const expires = Date.parse(payload.expiresAt);
  if (Number.isNaN(issued) || Number.isNaN(expires))
    return refuse("MALFORMED", "The times are not valid.");
  if (expires - issued > MAX_APPROVAL_VALIDITY_MINUTES * 60_000) {
    return refuse(
      "TOO_LONG",
      "The approval's validity is longer than the cap.",
    );
  }
  if (issued > expected.now.getTime() + MAX_CLOCK_SKEW_MS)
    return refuse("NOT_YET_VALID", "The approval is dated in the future.");
  if (expected.now.getTime() >= expires)
    return refuse("EXPIRED", "The approval has expired.");

  if (!(await deps.nonces.consume(payload.nonce, payload.expiresAt))) {
    return refuse("REPLAYED", "This approval has already been used.");
  }
  return { ok: true };
}

/**
 * An approval checker in the form the decision flow expects. The decision passes the
 * signal name, the artifact, and the exact value and resource it reads.
 */
export function approvalChecker(deps: {
  readonly approvers: ApproverKeys;
  readonly nonces: NonceStore;
}) {
  return async (
    signal: string,
    artifact: unknown,
    expected: {
      readonly resource: string;
      readonly value: Scalar;
      readonly action: string;
      readonly now: Date;
    },
  ): Promise<boolean> => {
    const result = await verifyApproval(
      artifact,
      {
        signal,
        capability: expected.action,
        resource: expected.resource,
        value: expected.value,
        now: expected.now,
      },
      deps,
    );
    return result.ok;
  };
}
