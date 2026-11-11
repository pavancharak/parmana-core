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

/**
 * Read-only capabilities the verifier key may sign for. Passed to the Gateway
 * as verificationOnlyKeys (audit G-111): a compromised verifier key can read
 * these, but cannot release any other capability.
 */
export const VERIFIER_READ_CAPABILITIES: readonly string[] = [
  "hubspot:deal-fetch",
];

/**
 * The Gateway's verificationOnlyKeys option for the verifier key. Always
 * configured, so a verifier-key authorization for any other capability is
 * refused at release.
 */
export function verificationOnlyKeysConfig(): {
  readonly keyIds: readonly string[];
  readonly capabilities: readonly string[];
} {
  return {
    keyIds: [verifierKeyId()],
    capabilities: VERIFIER_READ_CAPABILITIES,
  };
}
