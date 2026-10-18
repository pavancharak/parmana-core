import { timingSafeEqual } from "node:crypto";

import type { ApiKeyEntry } from "@parmana/shared";

import { hashApiKey } from "./hashApiKey.js";
import type {
  CallerAuthenticator,
  CallerIdentity,
} from "./CallerAuthenticator.js";

/**
 * Authenticates callers against a static, pre-hashed set
 * of API keys.
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
 * entry to revoke it. No downtime, no code change.
 */
export class StaticKeyAuthenticator implements CallerAuthenticator {
  constructor(private readonly entries: readonly ApiKeyEntry[]) {}

  authenticate(credential: string | undefined): CallerIdentity | undefined {
    if (!credential) return undefined;

    const candidate = Buffer.from(hashApiKey(credential), "hex");

    for (const entry of this.entries) {
      const stored = Buffer.from(entry.keyHash, "hex");

      if (
        stored.length === candidate.length &&
        timingSafeEqual(stored, candidate)
      ) {
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
    }

    return undefined;
  }
}
