import { timingSafeEqual } from "node:crypto";

import type {
  ApiKeyEntry,
  CallerKeyRevocationRepository,
} from "@parmana/shared";

import { hashApiKey } from "./hashApiKey.js";
import type {
  CallerAuthenticator,
  CallerIdentity,
} from "./CallerAuthenticator.js";

/**
 * Authenticates callers against a static, pre-hashed set
 * of API keys, and refuses any key revoked since startup.
 *
 * Keys are never held in plaintext: only a SHA-256 hash
 * of each key is compared, so a leak of this process's
 * config never yields a usable secret. Every comparison
 * runs in constant time against the hash bytes, never the
 * raw key.
 *
 * Multiple entries may share the same callerId, which is
 * how key rotation works: add the new key's hash, keep the
 * old one active during migration, then remove the old
 * entry to retire it at the next restart.
 *
 * Revocation is different from retirement. A revoked key is
 * recorded in the revocation store and refused on the next
 * request, with no restart. The store is read on every
 * request, and a lookup that fails refuses the key, so an
 * unavailable store never lets a revoked key through.
 */
export class StaticKeyAuthenticator implements CallerAuthenticator {
  constructor(
    private readonly entries: readonly ApiKeyEntry[],
    private readonly revocations?: CallerKeyRevocationRepository,
  ) {}

  async authenticate(
    credential: string | undefined,
  ): Promise<CallerIdentity | undefined> {
    if (!credential) return undefined;

    const keyHash = hashApiKey(credential);
    const entry = this.findEntry(Buffer.from(keyHash, "hex"));

    if (entry === undefined) return undefined;

    if (await this.isRevoked(keyHash)) return undefined;

    return identityOf(entry);
  }

  private findEntry(candidate: Buffer): ApiKeyEntry | undefined {
    for (const entry of this.entries) {
      const stored = Buffer.from(entry.keyHash, "hex");

      if (
        stored.length === candidate.length &&
        timingSafeEqual(stored, candidate)
      ) {
        return entry;
      }
    }

    return undefined;
  }

  /**
   * Fails closed: a store error counts as revoked, so the request is
   * refused rather than authenticated against a store it could not read.
   */
  private async isRevoked(keyHash: string): Promise<boolean> {
    if (this.revocations === undefined) return false;

    try {
      return await this.revocations.isRevoked(keyHash);
    } catch (error) {
      console.error({
        event: "caller_key_revocation_lookup_failed",
        error: error instanceof Error ? error.message : String(error),
      });

      return true;
    }
  }
}

function identityOf(entry: ApiKeyEntry): CallerIdentity {
  return {
    callerId: entry.callerId,
    ...(entry.allowedPrincipalIds !== undefined
      ? { allowedPrincipalIds: entry.allowedPrincipalIds }
      : {}),
    ...(entry.allowedCapabilities !== undefined
      ? { allowedCapabilities: entry.allowedCapabilities }
      : {}),
    ...(entry.allowedTenantIds !== undefined
      ? { allowedTenantIds: entry.allowedTenantIds }
      : {}),
    ...(entry.credentialHolderType !== undefined
      ? { credentialHolderType: entry.credentialHolderType }
      : {}),
    ...(entry.stepUpPublicKey !== undefined
      ? { stepUpPublicKey: entry.stepUpPublicKey }
      : {}),
  };
}
