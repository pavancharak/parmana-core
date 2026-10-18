import { describe, expect, it } from "vitest";

import { FileKeyProvider } from "../../src/providers/key/FileKeyProvider.js";
import { CryptoError } from "../../src/errors/CryptoError.js";

/**
 * PARMANA_KEY_DIR is set to a fresh temp directory containing a real
 * "default" keypair by the global vitest.setup.ts before this file runs.
 */
describe("FileKeyProvider keyId sanitization", () => {
  const TRAVERSAL_KEY_ID = "../../../../etc/passwd";

  it("rejects a path-traversal keyId in getPrivateKey before touching the filesystem", async () => {
    const provider = new FileKeyProvider();

    await expect(provider.getPrivateKey(TRAVERSAL_KEY_ID)).rejects.toThrow(
      CryptoError,
    );

    await expect(provider.getPrivateKey(TRAVERSAL_KEY_ID)).rejects.toThrow(
      /Invalid keyId/,
    );
  });

  it("rejects a path-traversal keyId in getPublicKey", async () => {
    const provider = new FileKeyProvider();

    await expect(provider.getPublicKey(TRAVERSAL_KEY_ID)).rejects.toThrow(
      /Invalid keyId/,
    );
  });

  it("rejects a path-traversal keyId in hasKey", async () => {
    const provider = new FileKeyProvider();

    await expect(provider.hasKey(TRAVERSAL_KEY_ID)).rejects.toThrow(
      /Invalid keyId/,
    );
  });

  it("rejects a path-traversal keyId in getMetadata", async () => {
    const provider = new FileKeyProvider();

    await expect(provider.getMetadata(TRAVERSAL_KEY_ID)).rejects.toThrow(
      /Invalid keyId/,
    );
  });

  it("accepts the well-formed keyId used by the rest of the suite", async () => {
    const provider = new FileKeyProvider();

    expect(await provider.hasKey("default")).toBe(true);
  });
});

describe("FileKeyProvider.getMetadata algorithm (PQC audit RED-2 fix)", () => {
  it("reports the key file's own real algorithm, not config.crypto.primarySignatureProvider", async () => {
    // vitest.setup.ts always generates "default" as a real Ed25519
    // key. Configuring PRIMARY_SIGNATURE_PROVIDER=dilithium3 before
    // constructing the provider proves getMetadata() no longer just
    // echoes that config value back -- before this fix, it would have
    // reported "dilithium3" for an Ed25519 key, silently wrong for
    // every keyId other than whichever one happens to match the
    // current config.
    const original = process.env.PRIMARY_SIGNATURE_PROVIDER;
    process.env.PRIMARY_SIGNATURE_PROVIDER = "dilithium3";

    try {
      const provider = new FileKeyProvider();
      const metadata = await provider.getMetadata("default");
      expect(metadata.algorithm).toBe("ed25519");
    } finally {
      if (original === undefined) {
        delete process.env.PRIMARY_SIGNATURE_PROVIDER;
      } else {
        process.env.PRIMARY_SIGNATURE_PROVIDER = original;
      }
    }
  });
});

describe("FileKeyProvider.listKeys (PQC audit RED-2)", () => {
  it("lists every keyId with a public key file, and only those", async () => {
    const provider = new FileKeyProvider();

    const keys = await provider.listKeys!();

    // vitest.setup.ts provisions "default" and "gateway".
    expect(keys).toEqual(expect.arrayContaining(["default", "gateway"]));
    expect(keys).not.toContain("default.public"); // no leftover extension
  });
});
