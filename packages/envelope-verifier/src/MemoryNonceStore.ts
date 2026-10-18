import type { NonceStore } from "./NonceStore.js";

/**
 * In-memory Nonce Store.
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
export class MemoryNonceStore implements NonceStore {
  private static readonly PURGE_THRESHOLD = 10_000;

  private readonly seen = new Map<string, number>();

  async checkAndRecord(nonce: string, expiresAt: string): Promise<boolean> {
    if (this.seen.has(nonce)) {
      return false;
    }

    this.seen.set(nonce, Date.parse(expiresAt));

    if (this.seen.size > MemoryNonceStore.PURGE_THRESHOLD) {
      this.purgeExpired();
    }

    return true;
  }

  /**
   * Number of nonces currently held. Exposed for
   * tests exercising the purge threshold.
   */
  get size(): number {
    return this.seen.size;
  }

  /**
   * Removes entries whose expiry has already
   * passed.
   */
  private purgeExpired(): void {
    const now = Date.now();

    for (const [nonce, expiry] of this.seen) {
      if (expiry <= now) {
        this.seen.delete(nonce);
      }
    }
  }
}
