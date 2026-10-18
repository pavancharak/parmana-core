import { describe, expect, it } from "vitest";

import { CryptoBuilder } from "../../src/CryptoBuilder.js";
import { CryptoError } from "../../src/errors/CryptoError.js";
import { SHA256HashProvider } from "../../src/providers/hash/SHA256HashProvider.js";
import { Ed25519SignatureProvider } from "../../src/providers/signature/Ed25519SignatureProvider.js";

describe("CryptoBuilder", () => {
  it("builds a CryptoProvider from a configured hash and signature provider", () => {
    const hash = new SHA256HashProvider();
    const signature = new Ed25519SignatureProvider();

    const provider = new CryptoBuilder()
      .withHash(hash)
      .withSignature(signature)
      .build();

    expect(provider.hash).toBe(hash);
    expect(provider.signature).toBe(signature);
  });

  it("throws when built without a hash provider", () => {
    expect(() =>
      new CryptoBuilder().withSignature(new Ed25519SignatureProvider()).build(),
    ).toThrow(CryptoError);
  });

  it("throws when built without a signature provider", () => {
    expect(() =>
      new CryptoBuilder().withHash(new SHA256HashProvider()).build(),
    ).toThrow(CryptoError);
  });
});
