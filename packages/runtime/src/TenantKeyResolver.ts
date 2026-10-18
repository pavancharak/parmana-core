import { DEFAULT_KEY_ID } from "@parmana/crypto";

/**
 * Resolves which signing keyId an Execution Authorization for a given
 * tenant should be signed with.
 */
export interface TenantKeyResolver {
  resolveKeyId(tenantId: string | undefined): Promise<string>;
}

const TENANT_KEY_PREFIX = "tenant.";

/**
 * The only capability FileTenantKeyResolver needs -- deliberately
 * narrower than KeyProvider so both KeyProvider (getPrivateKey +
 * friends) and Signer (ADR-0009's sign-without-release sibling, no
 * getPrivateKey) satisfy it structurally without either depending on
 * the other's full interface.
 */
interface KeyExistenceCheck {
  hasKey(keyId: string): Promise<boolean>;
}

/**
 * Looks for a dedicated key named "tenant.<tenantId>" in the same
 * KeyProvider that serves the shared default signing key -- no new key
 * storage, just a naming convention over the existing FileKeyProvider
 * layout (keys/<keyId>.private.pem), provisioned the same way as any
 * other key via scripts/generate-keypair.ts --key-id tenant.<tenantId>.
 *
 * Falls back to DEFAULT_KEY_ID when no tenantId is supplied, no
 * dedicated key has been provisioned for it yet, or tenantId contains
 * characters a keyId cannot (KeyProvider.hasKey rejects those before
 * touching the filesystem) -- an unprovisioned or malformed tenantId
 * degrades to the shared default key rather than failing signing
 * outright, so multi-tenant key isolation can be adopted per tenant
 * without a coordinated rollout.
 */
export class FileTenantKeyResolver implements TenantKeyResolver {
  constructor(private readonly keys: KeyExistenceCheck) {}

  async resolveKeyId(tenantId: string | undefined): Promise<string> {
    if (tenantId === undefined) {
      return DEFAULT_KEY_ID;
    }

    const candidate = `${TENANT_KEY_PREFIX}${tenantId}`;

    try {
      if (await this.keys.hasKey(candidate)) {
        return candidate;
      }
    } catch {
      // Malformed tenantId (invalid keyId characters) -- fall back
      // rather than fail signing over a per-tenant provisioning gap.
    }

    return DEFAULT_KEY_ID;
  }
}
