import { generateKeyPairSync, type KeyObject } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CryptoBuilder } from "../../src/CryptoBuilder.js";
import { HybridSignatureProvider } from "../../src/HybridSignatureProvider.js";
import type { KeyMetadata, KeyProvider } from "../../src/KeyProvider.js";
import type { Signer } from "../../src/Signer.js";
import type { HybridCryptoProvider } from "../../src/models/HybridCryptoProvider.js";
import { SHA256HashProvider } from "../../src/providers/hash/SHA256HashProvider.js";
import { Dilithium3SignatureProvider } from "../../src/providers/signature/Dilithium3SignatureProvider.js";
import { Ed25519SignatureProvider } from "../../src/providers/signature/Ed25519SignatureProvider.js";
import {
  isMlDsa65Supported,
  ML_DSA_65_SKIP_REASON,
} from "../../src/support/MlDsaSupport.js";

/**
 * Stands in for the KMS signer: it signs with a key it holds, and never hands the key out.
 * Records each call so the test can show the primary signature went through it.
 */
class FakeKmsSigner implements Signer {
  readonly calls: string[] = [];
  private readonly ed25519Private: KeyObject;
  private readonly ed25519Public: KeyObject;

  constructor(keyPair: { privateKey: KeyObject; publicKey: KeyObject }) {
    this.ed25519Private = keyPair.privateKey;
    this.ed25519Public = keyPair.publicKey;
  }

  async sign(keyId: string, data: Uint8Array): Promise<string> {
    this.calls.push(keyId);
    return new Ed25519SignatureProvider().sign(data, this.ed25519Private);
  }

  async getPublicKey(): Promise<KeyObject> {
    return this.ed25519Public;
  }

  async getMetadata(keyId: string): Promise<KeyMetadata> {
    throw new Error(`getMetadata not used in this test: ${keyId}`);
  }

  async hasKey(keyId: string): Promise<boolean> {
    return keyId === PRIMARY_KEY_ID;
  }
}

/** Holds the secondary key, and fails if anyone asks for the primary private key. */
class SecondaryOnlyKeyProvider implements KeyProvider {
  primaryReads = 0;

  constructor(
    private readonly secondaryPrivate: KeyObject,
    private readonly secondaryPublic: KeyObject,
    private readonly primaryPublic: KeyObject,
  ) {}

  async getMetadata(keyId: string): Promise<KeyMetadata> {
    throw new Error(`getMetadata not used in this test: ${keyId}`);
  }

  async getPrivateKey(keyId: string): Promise<KeyObject> {
    if (keyId === PRIMARY_KEY_ID) {
      this.primaryReads += 1;
      throw new Error("the primary private key must never be read");
    }
    return this.secondaryPrivate;
  }

  async getPublicKey(keyId: string): Promise<KeyObject> {
    return keyId === PRIMARY_KEY_ID ? this.primaryPublic : this.secondaryPublic;
  }

  async hasKey(keyId: string): Promise<boolean> {
    return keyId === PRIMARY_KEY_ID || keyId === SECONDARY_KEY_ID;
  }
}

const PRIMARY_KEY_ID = "default";
const SECONDARY_KEY_ID = "default-secondary";

function buildHybridCrypto(): HybridCryptoProvider {
  return {
    primary: new CryptoBuilder()
      .withHash(new SHA256HashProvider())
      .withSignature(new Ed25519SignatureProvider())
      .build(),
    secondary: new CryptoBuilder()
      .withHash(new SHA256HashProvider())
      .withSignature(new Dilithium3SignatureProvider())
      .build(),
  };
}

describe.skipIf(!isMlDsa65Supported())(
  `HybridSignatureProvider with a KMS primary${isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`}`,
  () => {
    const artifact = { businessTransactionId: "bt-kms", amount: 250 };

    it("makes the primary signature through the signer and never reads the primary private key", async () => {
      const ed25519 = generateKeyPairSync("ed25519");
      const dilithium3 = generateKeyPairSync("ml-dsa-65");
      const keys = new SecondaryOnlyKeyProvider(
        dilithium3.privateKey,
        dilithium3.publicKey,
        ed25519.publicKey,
      );
      const signer = new FakeKmsSigner(ed25519);
      const provider = new HybridSignatureProvider(
        buildHybridCrypto(),
        keys,
        undefined,
        signer,
      );

      const signatures = await provider.sign(
        artifact,
        PRIMARY_KEY_ID,
        SECONDARY_KEY_ID,
      );

      expect(signer.calls).toEqual([PRIMARY_KEY_ID]);
      expect(keys.primaryReads).toBe(0);
      expect(signatures.map((entry) => entry.algorithm).sort()).toEqual([
        "dilithium3",
        "ed25519",
      ]);
    });

    it("produces the same primary signature as the file-key path, so verifiers cannot tell them apart", async () => {
      const ed25519 = generateKeyPairSync("ed25519");
      const dilithium3 = generateKeyPairSync("ml-dsa-65");

      const fileKeys = new SecondaryOnlyKeyProvider(
        dilithium3.privateKey,
        dilithium3.publicKey,
        ed25519.publicKey,
      );
      // The file-key path reads the primary private key, so give it one.
      const fileKeyPath: KeyProvider = {
        ...fileKeys,
        getPrivateKey: async (keyId: string) =>
          keyId === PRIMARY_KEY_ID ? ed25519.privateKey : dilithium3.privateKey,
        getMetadata: fileKeys.getMetadata.bind(fileKeys),
        getPublicKey: fileKeys.getPublicKey.bind(fileKeys),
        hasKey: fileKeys.hasKey.bind(fileKeys),
      };
      const viaFile = await new HybridSignatureProvider(
        buildHybridCrypto(),
        fileKeyPath,
      ).sign(artifact, PRIMARY_KEY_ID, SECONDARY_KEY_ID);

      const viaSigner = await new HybridSignatureProvider(
        buildHybridCrypto(),
        fileKeys,
        undefined,
        new FakeKmsSigner(ed25519),
      ).sign(artifact, PRIMARY_KEY_ID, SECONDARY_KEY_ID);

      const primaryOf = (entries: typeof viaFile) =>
        entries.find((e) => e.algorithm === "ed25519");
      expect(primaryOf(viaSigner)?.signature).toBe(
        primaryOf(viaFile)?.signature,
      );
    });
  },
);
