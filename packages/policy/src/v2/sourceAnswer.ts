/**
 * The signing contract for a source's answer (design 4.1).
 *
 * Every answer a trusted source gives is signed with its registered key, over
 * the value, the subject, the claim, the observation time, the expiry, a nonce
 * and the transaction ID. The verifier accepts an answer only when every check
 * passes, and it says which check failed.
 *
 * Standalone. The runtime does not use it yet.
 */

import { createPublicKey, sign, verify, type KeyObject } from "node:crypto";

/** What the source says, before it is signed. */
export interface AnswerPayload {
  readonly source: string;
  readonly keyId: string;
  readonly claim: string;
  readonly subject: string;
  readonly value: string | number | boolean;
  readonly unit?: string;
  readonly action: string;
  readonly transactionId: string;
  readonly nonce: string;
  readonly observedAt: string;
  readonly expiresAt: string;
}

export interface SignedAnswer {
  readonly payload: AnswerPayload;
  /** Base64 Ed25519 signature over the canonical form of the payload. */
  readonly signature: string;
}

/** What the caller asked the source. The answer must match it exactly. */
export interface ExpectedQuery {
  readonly source: string;
  readonly claim: string;
  readonly subject: string;
  readonly action: string;
  readonly transactionId: string;
}

export type KeyLookup = (
  source: string,
  keyId: string,
) => KeyObject | "revoked" | undefined;

/** Remembers nonces, so an answer cannot be used twice. */
export interface NonceStore {
  /**
   * Records the nonce if it is new. Returns false if it was already used. Asynchronous, so a
   * store shared by several processes can answer atomically.
   */
  consume(nonce: string, expiresAt: string): Promise<boolean>;
}

export type RefusalCode =
  | "UNSIGNED"
  | "MALFORMED"
  | "QUERY_MISMATCH"
  | "UNKNOWN_KEY"
  | "KEY_REVOKED"
  | "BAD_SIGNATURE"
  | "NOT_YET_VALID"
  | "EXPIRED"
  | "REPLAYED";

export type VerifyResult =
  | { readonly ok: true; readonly value: string | number | boolean }
  | { readonly ok: false; readonly code: RefusalCode; readonly reason: string };

/** Clocks may disagree by up to this much (matches the design's observation skew). */
export const MAX_CLOCK_SKEW_MS = 60_000;

/** Canonical form: keys sorted at every level, no whitespace. Both sides must use it. */
export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.keys(value)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`,
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Signs a payload with a source's private key. Used by the source (or its intermediary). */
export function signAnswer(
  payload: AnswerPayload,
  privateKey: KeyObject,
): SignedAnswer {
  const signature = sign(
    null,
    Buffer.from(canonicalize(payload)),
    privateKey,
  ).toString("base64");
  return { payload, signature };
}

/** Reads a registered public key, which must be Ed25519. Throws if it is not. */
export function readEd25519PublicKey(pem: string): KeyObject {
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("The source's public key must be Ed25519.");
  }
  return key;
}

function isPayload(value: unknown): value is AnswerPayload {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  const strings = [
    "source",
    "keyId",
    "claim",
    "subject",
    "action",
    "transactionId",
    "nonce",
    "observedAt",
    "expiresAt",
  ];
  return (
    strings.every(
      (key) => typeof p[key] === "string" && (p[key] as string).length > 0,
    ) &&
    (typeof p["value"] === "string" ||
      typeof p["value"] === "number" ||
      typeof p["value"] === "boolean") &&
    (p["unit"] === undefined || typeof p["unit"] === "string")
  );
}

/**
 * Verifies a source's answer against the query that was asked. Checks run in
 * this order. The nonce is consumed last, so an answer refused for another
 * reason can still be sent again.
 */
export async function verifySourceAnswer(
  answer: unknown,
  expected: ExpectedQuery,
  deps: {
    readonly keyFor: KeyLookup;
    readonly nonces: NonceStore;
    readonly now: Date;
  },
): Promise<VerifyResult> {
  const refuse = (code: RefusalCode, reason: string): VerifyResult => ({
    ok: false,
    code,
    reason,
  });

  if (typeof answer !== "object" || answer === null)
    return refuse("MALFORMED", "The answer is not an object.");
  const { payload, signature } = answer as {
    payload?: unknown;
    signature?: unknown;
  };
  if (typeof signature !== "string" || signature.length === 0) {
    return refuse(
      "UNSIGNED",
      "The answer carries no signature. An unsigned answer is untrusted.",
    );
  }
  if (!isPayload(payload))
    return refuse("MALFORMED", "The answer's payload is incomplete.");

  if (
    payload.source !== expected.source ||
    payload.claim !== expected.claim ||
    payload.subject !== expected.subject ||
    payload.action !== expected.action ||
    payload.transactionId !== expected.transactionId
  ) {
    return refuse(
      "QUERY_MISMATCH",
      "The answer is for a different source, claim, subject, action or transaction.",
    );
  }

  const key = deps.keyFor(payload.source, payload.keyId);
  if (key === undefined)
    return refuse(
      "UNKNOWN_KEY",
      `Key "${payload.keyId}" is not registered for "${payload.source}".`,
    );
  if (key === "revoked")
    return refuse(
      "KEY_REVOKED",
      `The source "${payload.source}" has been revoked.`,
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
  if (!valid) {
    return refuse(
      "BAD_SIGNATURE",
      "The signature does not verify with the registered key. The answer was altered, or signed with another key.",
    );
  }

  const observed = Date.parse(payload.observedAt);
  const expires = Date.parse(payload.expiresAt);
  if (Number.isNaN(observed) || Number.isNaN(expires))
    return refuse("MALFORMED", "The times are not valid.");
  if (observed > deps.now.getTime() + MAX_CLOCK_SKEW_MS) {
    return refuse("NOT_YET_VALID", "The answer was observed in the future.");
  }
  if (deps.now.getTime() >= expires)
    return refuse("EXPIRED", "The answer has expired.");

  if (!(await deps.nonces.consume(payload.nonce, payload.expiresAt))) {
    return refuse("REPLAYED", "This answer has already been used.");
  }
  return { ok: true, value: payload.value };
}

/** A nonce store in memory. Expired nonces are dropped when the store is read. */
export class MemoryNonceStore implements NonceStore {
  private readonly used = new Map<string, number>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async consume(nonce: string, expiresAt: string): Promise<boolean> {
    const nowMs = this.now().getTime();
    for (const [key, until] of this.used) {
      if (until <= nowMs) this.used.delete(key);
    }
    if (this.used.has(nonce)) return false;
    this.used.set(nonce, Date.parse(expiresAt));
    return true;
  }
}
