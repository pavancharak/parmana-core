/**
 * Who the API key belongs to and what it may do. The response of
 * GET /callers/me.
 */
export interface CallerIdentity {
  readonly callerId: string;

  /**
   * Principal IDs this key may name in a request's
   * `authority.principalId`. Only its own caller ID unless the key lists
   * others.
   */
  readonly allowedPrincipalIds: readonly string[];

  /**
   * Capabilities this key may request. Empty means none.
   */
  readonly allowedCapabilities: readonly string[];

  /**
   * True when `allowedCapabilities` contains `*`.
   */
  readonly unrestrictedCapabilities: boolean;
}

/**
 * A signing public key of the deployment. The response of
 * GET /keys/{keyId}.
 */
export interface PublicKeyInfo {
  readonly keyId: string;
  readonly algorithm: string;
  readonly use: "sig";

  /**
   * SPKI PEM. Pass it to the offline verifiers.
   */
  readonly pem: string;

  /**
   * The same key as a JSON Web Key, when the algorithm has a JWK form.
   */
  readonly jwk?: Record<string, unknown>;
}
