/**
 * The key id the Signal/State verifier signs its read-only fetches with.
 * Separate from the authorization key, so the release path's signing key is
 * never used for those fetches. Override with PARMANA_VERIFIER_KEY_ID. The key
 * must exist (public and private PEM in PARMANA_KEY_DIR, or in KMS).
 */
export const DEFAULT_VERIFIER_KEY_ID = "signal-verifier";

export function verifierKeyId(): string {
  return process.env.PARMANA_VERIFIER_KEY_ID?.trim() || DEFAULT_VERIFIER_KEY_ID;
}
