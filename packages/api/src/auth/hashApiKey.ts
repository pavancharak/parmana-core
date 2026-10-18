import { createHash } from "node:crypto";

/**
 * SHA-256 hex digest of a raw API key.
 *
 * Keys are high-entropy, machine-generated random values
 * (see scripts/generate-api-key.ts), not human-chosen
 * passwords, so a fast cryptographic hash is sufficient:
 * slow password-hashing algorithms (bcrypt/scrypt/argon2)
 * exist specifically to resist brute-forcing low-entropy
 * secrets, which does not apply to a 256-bit random key.
 */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}
