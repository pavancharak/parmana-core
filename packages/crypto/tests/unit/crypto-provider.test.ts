import { describe, expect, it } from "vitest";

import { HashAlgorithms, SignatureAlgorithms } from "@parmana/shared";

import { HashRegistry } from "../../src/providers/HashRegistry.js";
import { SignatureRegistry } from "../../src/providers/SignatureRegistry.js";
import { SHA256HashProvider } from "../../src/providers/hash/SHA256HashProvider.js";
import { Ed25519SignatureProvider } from "../../src/providers/signature/Ed25519SignatureProvider.js";
import { Dilithium3SignatureProvider } from "../../src/providers/signature/Dilithium3SignatureProvider.js";

describe("CryptoProvider registries select by algorithm", () => {
  it("HashRegistry selects the provider registered for an algorithm", () => {
    const registry = new HashRegistry();
    const sha256 = new SHA256HashProvider();

    registry.register(sha256);

    expect(registry.get(HashAlgorithms.SHA256)).toBe(sha256);
  });

  it("HashRegistry throws for an unregistered algorithm", () => {
    const registry = new HashRegistry();

    expect(() => registry.get(HashAlgorithms.SHA256)).toThrow(
      /Unknown hash provider/,
    );
  });

  it("SignatureRegistry selects the provider registered for each algorithm", () => {
    const registry = new SignatureRegistry();
    const ed25519 = new Ed25519SignatureProvider();
    const dilithium3 = new Dilithium3SignatureProvider();

    registry.register(ed25519);
    registry.register(dilithium3);

    expect(registry.get(SignatureAlgorithms.ED25519)).toBe(ed25519);
    expect(registry.get(SignatureAlgorithms.DILITHIUM3)).toBe(dilithium3);
  });

  it("SignatureRegistry throws for an unregistered algorithm", () => {
    const registry = new SignatureRegistry();

    expect(() => registry.get(SignatureAlgorithms.ED25519)).toThrow(
      /Unknown signature provider/,
    );
  });
});
