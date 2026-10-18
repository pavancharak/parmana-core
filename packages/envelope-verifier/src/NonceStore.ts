/**
 * Nonce Store.
 *
 * Records nonces that have been accepted, so an
 * authorization can never be accepted twice.
 *
 * PRODUCTION WARNING: the in-memory implementation
 * loses all state on restart. A restarted process
 * will accept a replayed authorization that is still
 * within its TTL. Production deployments MUST use a
 * persistent implementation. Because envelopes carry
 * a short TTL, the persistence window only needs to
 * cover the maximum TTL — expired envelopes are
 * rejected by the TTL check regardless of nonce state.
 */
export interface NonceStore {
  /**
   * Atomically records the nonce if unseen.
   *
   * Returns true if the nonce was unseen and is now
   * recorded (authorization may proceed).
   * Returns false if the nonce was already seen
   * (authorization MUST be rejected).
   */
  checkAndRecord(nonce: string, expiresAt: string): Promise<boolean>;
}
