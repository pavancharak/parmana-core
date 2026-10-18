import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { SignerKeyProviderAdapter } from "../../src/providers/SignerKeyProviderAdapter.js";
import type { Signer } from "../../src/Signer.js";

const { publicKey } = generateKeyPairSync("ed25519");

function fakeSigner(overrides: Partial<Signer> = {}): Signer {
  return {
    sign: vi.fn().mockResolvedValue("base64-signature"),
    getPublicKey: vi.fn().mockResolvedValue(publicKey),
    getMetadata: vi
      .fn()
      .mockResolvedValue({ keyId: "default", algorithm: "ed25519" }),
    hasKey: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("SignerKeyProviderAdapter", () => {
  it("delegates getPublicKey to the wrapped Signer", async () => {
    const signer = fakeSigner();
    const adapter = new SignerKeyProviderAdapter(signer);

    const result = await adapter.getPublicKey("default");

    expect(result).toBe(publicKey);
    expect(signer.getPublicKey).toHaveBeenCalledWith("default");
  });

  it("delegates getMetadata to the wrapped Signer", async () => {
    const signer = fakeSigner();
    const adapter = new SignerKeyProviderAdapter(signer);

    const result = await adapter.getMetadata("default");

    expect(result).toEqual({ keyId: "default", algorithm: "ed25519" });
  });

  it("delegates hasKey to the wrapped Signer", async () => {
    const signer = fakeSigner({ hasKey: vi.fn().mockResolvedValue(false) });
    const adapter = new SignerKeyProviderAdapter(signer);

    expect(await adapter.hasKey("missing")).toBe(false);
  });

  it("getPrivateKey always throws -- a Signer never releases private key material", async () => {
    const signer = fakeSigner();
    const adapter = new SignerKeyProviderAdapter(signer);

    await expect(adapter.getPrivateKey("default")).rejects.toThrow(
      /does not expose private key material/,
    );
  });

  it("listKeys delegates when the underlying Signer supports it", async () => {
    const signer = fakeSigner({
      listKeys: vi.fn().mockResolvedValue(["default", "tenant.acme"]),
    });
    const adapter = new SignerKeyProviderAdapter(signer);

    expect(await adapter.listKeys()).toEqual(["default", "tenant.acme"]);
  });

  it("listKeys throws when the underlying Signer does not support it (e.g. KmsSigner)", async () => {
    const signer = fakeSigner();
    const adapter = new SignerKeyProviderAdapter(signer);

    await expect(adapter.listKeys()).rejects.toThrow(
      /does not support listKeys/,
    );
  });
});
