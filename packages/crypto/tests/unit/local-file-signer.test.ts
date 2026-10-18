import { describe, expect, it } from "vitest";

import { ArtifactSigner } from "../../src/ArtifactSigner.js";
import { CryptoBootstrap } from "../../src/CryptoBootstrap.js";
import { FileKeyProvider } from "../../src/providers/key/FileKeyProvider.js";
import { LocalFileSigner } from "../../src/providers/signer/LocalFileSigner.js";
import { SignatureVerifier } from "../../src/SignatureVerifier.js";

/**
 * PARMANA_KEY_DIR is set to a fresh temp directory containing a real
 * "default" keypair by the global vitest.setup.ts before this file
 * runs (same setup file-key-provider.test.ts relies on).
 */
describe("LocalFileSigner", () => {
  it("sign() produces a signature that verifies against the key's own public key", async () => {
    const crypto = CryptoBootstrap.create();
    const signer = new LocalFileSigner(crypto);
    const verifier = new SignatureVerifier(crypto);

    const artifact = { hello: "world" };
    const bytes = new (
      await import("../../src/CanonicalSerializer.js")
    ).CanonicalSerializer().serialize(artifact);

    const signature = await signer.sign("default", bytes);

    const publicKey = await signer.getPublicKey("default");
    expect(await verifier.verify(artifact, signature, publicKey)).toBe(true);
  });

  it("sign() produces byte-identical output to the pre-ADR-0009 getPrivateKey()+ArtifactSigner.sign() path", async () => {
    const crypto = CryptoBootstrap.create();
    const signer = new LocalFileSigner(crypto);
    const artifactSigner = new ArtifactSigner(crypto);
    const keys = new FileKeyProvider();

    const artifact = { businessTransactionId: "txn_123", amount: 42 };

    const viaSignWithSigner = await artifactSigner.signWithSigner(
      artifact,
      "default",
      signer,
    );

    const privateKey = await keys.getPrivateKey("default");
    const viaLegacyPath = await artifactSigner.sign(artifact, privateKey);

    // Ed25519 signing is deterministic (RFC 8032) -- same key, same
    // message, same signature every time -- so this is a genuine
    // equality check, not a flaky one.
    expect(viaSignWithSigner).toBe(viaLegacyPath);
  });

  it("getMetadata/hasKey/listKeys proxy to the underlying FileKeyProvider", async () => {
    const signer = new LocalFileSigner(CryptoBootstrap.create());

    expect(await signer.hasKey("default")).toBe(true);
    expect((await signer.getMetadata("default")).algorithm).toBe("ed25519");
    expect(await signer.listKeys!()).toEqual(
      expect.arrayContaining(["default", "gateway"]),
    );
  });
});
