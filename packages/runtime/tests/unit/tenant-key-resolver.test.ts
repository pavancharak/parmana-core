import { describe, expect, it } from "vitest";

import type { KeyMetadata, KeyProvider } from "@parmana/crypto";
import { DEFAULT_KEY_ID } from "@parmana/crypto";
import type { KeyObject } from "node:crypto";

import { FileTenantKeyResolver } from "../../src/TenantKeyResolver.js";

/**
 * Stub KeyProvider exercising only hasKey(), which is all
 * FileTenantKeyResolver depends on -- getPrivateKey/getPublicKey/
 * getMetadata are never called by the resolver itself.
 */
class StubKeyProvider implements KeyProvider {
  constructor(
    private readonly known: ReadonlySet<string>,
    private readonly throwing: ReadonlySet<string> = new Set(),
  ) {}

  async hasKey(keyId: string): Promise<boolean> {
    if (this.throwing.has(keyId)) {
      throw new Error(`Invalid keyId: "${keyId}"`);
    }
    return this.known.has(keyId);
  }

  async getMetadata(): Promise<KeyMetadata> {
    throw new Error("not used by these tests");
  }

  async getPrivateKey(): Promise<KeyObject> {
    throw new Error("not used by these tests");
  }

  async getPublicKey(): Promise<KeyObject> {
    throw new Error("not used by these tests");
  }
}

describe("FileTenantKeyResolver", () => {
  it("resolves the shared default key when no tenantId is supplied", async () => {
    const resolver = new FileTenantKeyResolver(new StubKeyProvider(new Set()));

    expect(await resolver.resolveKeyId(undefined)).toBe(DEFAULT_KEY_ID);
  });

  it("resolves a tenant-specific keyId when a dedicated key has been provisioned", async () => {
    const resolver = new FileTenantKeyResolver(
      new StubKeyProvider(new Set(["tenant.acme-corp"])),
    );

    expect(await resolver.resolveKeyId("acme-corp")).toBe("tenant.acme-corp");
  });

  it("falls back to the shared default key when no dedicated key exists for the tenant", async () => {
    const resolver = new FileTenantKeyResolver(
      new StubKeyProvider(new Set(["tenant.acme-corp"])),
    );

    expect(await resolver.resolveKeyId("globex-corp")).toBe(DEFAULT_KEY_ID);
  });

  it("falls back to the shared default key when tenantId is not a valid keyId", async () => {
    const resolver = new FileTenantKeyResolver(
      new StubKeyProvider(new Set(), new Set(["tenant.../../etc/passwd"])),
    );

    expect(await resolver.resolveKeyId("../../etc/passwd")).toBe(
      DEFAULT_KEY_ID,
    );
  });

  it("never returns the same keyId for two different tenants with distinct provisioned keys", async () => {
    const resolver = new FileTenantKeyResolver(
      new StubKeyProvider(new Set(["tenant.acme-corp", "tenant.globex-corp"])),
    );

    const acme = await resolver.resolveKeyId("acme-corp");
    const globex = await resolver.resolveKeyId("globex-corp");

    expect(acme).not.toBe(globex);
  });
});
