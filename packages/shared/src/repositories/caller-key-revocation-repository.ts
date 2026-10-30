/**
 * One caller API key revoked after startup. Only the SHA-256 hash of
 * the key is stored, never the key.
 */
export interface CallerKeyRevocation {
  readonly keyHash: string;
  readonly callerId: string;
  readonly revokedBy: string;
  readonly reason: string;
  readonly revokedAt: Date;
}

/**
 * Caller API keys revoked since the server started. The caller-auth
 * layer reads it on every request, so a revocation applies to the next
 * request with no restart. Config-listed keys stay in PARMANA_API_KEYS
 * and are refused here once their hash appears.
 */
export interface CallerKeyRevocationRepository {
  isRevoked(keyHash: string): Promise<boolean>;

  /**
   * Records a revocation. Revoking a key that is already revoked does
   * nothing, so a repeated call is safe.
   */
  revoke(revocation: CallerKeyRevocation): Promise<void>;
}
