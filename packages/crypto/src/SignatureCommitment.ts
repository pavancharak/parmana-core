import { createHash } from "node:crypto";

/**
 * AWS KMS caps the raw message it will sign with an Ed25519 key
 * (ED25519_SHA_512, MessageType RAW) at 4096 bytes. A full Execution
 * Trust Record, with its bound authorization, connector evidence and
 * governance anchor, is larger than that, so signing it directly fails.
 *
 * Large message commitment (v1): a message longer than the limit is
 * signed as a fixed size commitment, the domain separation prefix
 * followed by the SHA-512 digest of the message. The signature is still
 * a pure Ed25519 signature, so it needs no new algorithm and any
 * standard Ed25519 library can verify it once it rebuilds the same
 * commitment.
 *
 * The scheme is a pure function of message length, so no marker has to
 * be stored on any record:
 *
 * - length <= limit: signed and verified raw, exactly as before, so
 *   every signature issued before this change stays valid.
 * - length > limit: signed as the commitment. A verifier also accepts a
 *   raw signature over such a message, because a local key signer has
 *   always signed large messages raw and those records still exist.
 *
 * The prefix contains a NUL byte and never occurs at the start of a
 * canonical JSON message (which starts with "{"), so a signature over a
 * commitment cannot be replayed as a signature over a small raw message.
 * A commitment signature over a message at or below the limit is not
 * accepted, which prevents downgrading a small message to the
 * commitment form.
 */
export const KMS_RAW_MESSAGE_LIMIT_BYTES = 4096;

const COMMITMENT_PREFIX = Buffer.from(
  "PARMANA-ED25519-LARGE-MESSAGE-V1\0",
  "utf8",
);

export function requiresCommitment(data: Uint8Array): boolean {
  return data.length > KMS_RAW_MESSAGE_LIMIT_BYTES;
}

export function commitmentMessage(data: Uint8Array): Uint8Array {
  return Buffer.concat([
    COMMITMENT_PREFIX,
    createHash("sha512").update(data).digest(),
  ]);
}
