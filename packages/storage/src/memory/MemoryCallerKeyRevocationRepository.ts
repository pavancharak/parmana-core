import type {
  CallerKeyRevocation,
  CallerKeyRevocationRepository,
} from "@parmana/shared";

/**
 * In memory CallerKeyRevocationRepository, with the same rules as the
 * Postgres one: a key is revoked once, and a repeated revoke changes
 * nothing.
 */
export class MemoryCallerKeyRevocationRepository implements CallerKeyRevocationRepository {
  private readonly revocations = new Map<string, CallerKeyRevocation>();

  async isRevoked(keyHash: string): Promise<boolean> {
    return this.revocations.has(keyHash);
  }

  async revoke(revocation: CallerKeyRevocation): Promise<void> {
    if (!this.revocations.has(revocation.keyHash)) {
      this.revocations.set(revocation.keyHash, revocation);
    }
  }
}
