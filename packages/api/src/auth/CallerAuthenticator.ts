import type { AuthorityType } from "@parmana/shared";

export interface CallerIdentity {
  readonly callerId: string;

  /**
   * The set of Authority.principalId values this caller may assert.
   * Undefined means the caller-auth middleware defaults to "only the
   * callerId itself" — see ApiKeyEntry.allowedPrincipalIds.
   */
  readonly allowedPrincipalIds?: readonly string[];

  /**
   * The set of capabilities (Intent.action values) this caller may
   * invoke. Undefined or empty means the caller-auth layer denies
   * every capability — see ApiKeyEntry.allowedCapabilities for the
   * fail-closed default and the "*" wildcard convention.
   */
  readonly allowedCapabilities?: readonly string[];
  readonly allowedTenantIds?: readonly string[];

  /**
   * The kind of entity that holds this credential — see
   * ApiKeyEntry.credentialHolderType for the fail-closed default
   * (undefined means "not verified," never "assume human") and
   * isHumanCaller.ts for the one place this is checked today.
   */
  readonly credentialHolderType?: AuthorityType;

  /**
   * PEM-encoded Ed25519 public key for step-up authorization — see
   * ApiKeyEntry.stepUpPublicKey and PolicyChangeStepUpAuthorization.
   * Absent means this caller cannot complete step-up at all.
   */
  readonly stepUpPublicKey?: string;
}

/**
 * Authenticates a caller of the Parmana API from an
 * opaque credential string already extracted from the
 * request by the middleware.
 *
 * Deliberately transport-agnostic: it receives a string,
 * not an Express Request, so swapping StaticKeyAuthenticator
 * for an mTLS-based implementation later (which would pass
 * a certificate's subject or fingerprint as the credential
 * string instead of a bearer token) is a class swap at
 * this one boundary, not an architecture change.
 */
export interface CallerAuthenticator {
  authenticate(credential: string | undefined): CallerIdentity | undefined;
}
