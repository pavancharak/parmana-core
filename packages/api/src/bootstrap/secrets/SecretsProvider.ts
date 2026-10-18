/**
 * Secrets Provider (ADR-0009).
 *
 * Resolves an opaque connector credential -- a bearer token/shared
 * secret, never a signing key (see @parmana/crypto's Signer for
 * those) -- given a reference to it. What the reference means depends
 * on the provider: identity (the raw value) in EnvSecretsProvider, a
 * Secrets Manager secret name/ARN in AwsSecretsManagerProvider.
 *
 * Deliberately narrower than a generic KV store: get-by-reference
 * only, no listing, no writing. Every existing connector credential
 * provider (createHubSpotCredentialProvider.ts,
 * createPaytmCredentialProvider.ts) already reads exactly one named
 * secret per connector, so a single getSecret() call is all any
 * caller needs.
 */
export interface SecretsProvider {
  /**
   * Resolves a secret reference to its actual value.
   *
   * @param reference In "env" mode, the value itself (returned
   *   unchanged). In "aws-secrets-manager" mode, the Secrets Manager
   *   secret name or ARN to fetch.
   */
  getSecret(reference: string): Promise<string>;
}
