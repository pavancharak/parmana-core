import { generateKeyPairSync, type KeyObject } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CryptoBuilder } from "../../src/CryptoBuilder.js";
import { HybridSignatureProvider } from "../../src/HybridSignatureProvider.js";
import type { KeyMetadata, KeyProvider } from "../../src/KeyProvider.js";
import type { HybridCryptoProvider } from "../../src/models/HybridCryptoProvider.js";
import { SHA256HashProvider } from "../../src/providers/hash/SHA256HashProvider.js";
import {
  SECRET_KEY_CACHE_TTL_MS,
  SecretSecondaryKeyProvider,
} from "../../src/providers/key/SecretSecondaryKeyProvider.js";
import { Dilithium3SignatureProvider } from "../../src/providers/signature/Dilithium3SignatureProvider.js";
import { Ed25519SignatureProvider } from "../../src/providers/signature/Ed25519SignatureProvider.js";
import {
  isMlDsa65Supported,
  ML_DSA_65_SKIP_REASON,
} from "../../src/support/MlDsaSupport.js";

const PRIMARY_KEY_ID = "default";
const SECONDARY_KEY_ID = "default-secondary";
const SECRET_ID = "parmana/default-secondary";

/** A fallback that holds only the primary key, and counts how often it is asked. */
class FallbackKeys implements KeyProvider {
  reads = 0;

  constructor(
    private readonly primary: { privateKey: KeyObject; publicKey: KeyObject },
  ) {}

  async getMetadata(keyId: string): Promise<KeyMetadata> {
    throw new Error(`getMetadata not used: ${keyId}`);
  }

  async getPrivateKey(keyId: string): Promise<KeyObject> {
    this.reads += 1;
    if (keyId !== PRIMARY_KEY_ID) throw new Error(`no file key ${keyId}`);
    return this.primary.privateKey;
  }

  async getPublicKey(keyId: string): Promise<KeyObject> {
    if (keyId !== PRIMARY_KEY_ID) throw new Error(`no file key ${keyId}`);
    return this.primary.publicKey;
  }

  async hasKey(keyId: string): Promise<boolean> {
    return keyId === PRIMARY_KEY_ID;
  }
}

describe.skipIf(!isMlDsa65Supported())(
  `SecretSecondaryKeyProvider${isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`}`,
  () => {
    const dilithium = generateKeyPairSync("ml-dsa-65");
    const ed25519 = generateKeyPairSync("ed25519");
    const secretPem = dilithium.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();

    it("serves the secondary private key from the secret and derives its public key", async () => {
      const provider = new SecretSecondaryKeyProvider(
        SECONDARY_KEY_ID,
        SECRET_ID,
        async () => secretPem,
        new FallbackKeys(ed25519),
      );

      const pub = await provider.getPublicKey(SECONDARY_KEY_ID);
      expect(pub.export({ type: "spki", format: "pem" })).toBe(
        dilithium.publicKey.export({ type: "spki", format: "pem" }),
      );
      expect(await provider.hasKey(SECONDARY_KEY_ID)).toBe(true);
    });

    it("never asks the fallback for the secondary key, and never reads the secret for other keys", async () => {
      let secretReads = 0;
      const fallback = new FallbackKeys(ed25519);
      const provider = new SecretSecondaryKeyProvider(
        SECONDARY_KEY_ID,
        SECRET_ID,
        async () => {
          secretReads += 1;
          return secretPem;
        },
        fallback,
      );

      await provider.getPrivateKey(SECONDARY_KEY_ID);
      expect(fallback.reads).toBe(0);

      await provider.getPrivateKey(PRIMARY_KEY_ID);
      expect(fallback.reads).toBe(1);
      expect(secretReads).toBe(1);
    });

    it("reads the secret once within the cache window, and again after it", async () => {
      let clock = 0;
      let secretReads = 0;
      const provider = new SecretSecondaryKeyProvider(
        SECONDARY_KEY_ID,
        SECRET_ID,
        async () => {
          secretReads += 1;
          return secretPem;
        },
        new FallbackKeys(ed25519),
        () => clock,
      );

      await provider.getPrivateKey(SECONDARY_KEY_ID);
      clock = SECRET_KEY_CACHE_TTL_MS - 1;
      await provider.getPrivateKey(SECONDARY_KEY_ID);
      expect(secretReads).toBe(1);

      clock = SECRET_KEY_CACHE_TTL_MS + 1;
      await provider.getPrivateKey(SECONDARY_KEY_ID);
      expect(secretReads).toBe(2);
    });

    it("does not cache a failed read, so a fix takes effect on the next request", async () => {
      let attempts = 0;
      const provider = new SecretSecondaryKeyProvider(
        SECONDARY_KEY_ID,
        SECRET_ID,
        async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("secret temporarily unavailable");
          return secretPem;
        },
        new FallbackKeys(ed25519),
      );

      await expect(provider.getPrivateKey(SECONDARY_KEY_ID)).rejects.toThrow(
        "temporarily unavailable",
      );
      await expect(
        provider.getPrivateKey(SECONDARY_KEY_ID),
      ).resolves.toBeDefined();
      expect(attempts).toBe(2);
    });

    it("signs a hybrid record with the secondary key taken only from the secret", async () => {
      const crypto: HybridCryptoProvider = {
        primary: new CryptoBuilder()
          .withHash(new SHA256HashProvider())
          .withSignature(new Ed25519SignatureProvider())
          .build(),
        secondary: new CryptoBuilder()
          .withHash(new SHA256HashProvider())
          .withSignature(new Dilithium3SignatureProvider())
          .build(),
      };
      const fallback = new FallbackKeys(ed25519);
      const keys = new SecretSecondaryKeyProvider(
        SECONDARY_KEY_ID,
        SECRET_ID,
        async () => secretPem,
        fallback,
      );
      const provider = new HybridSignatureProvider(crypto, keys);
      const artifact = { businessTransactionId: "bt-secret", amount: 75 };

      const signatures = await provider.sign(
        artifact,
        PRIMARY_KEY_ID,
        SECONDARY_KEY_ID,
      );

      expect(signatures.map((entry) => entry.algorithm).sort()).toEqual([
        "dilithium3",
        "ed25519",
      ]);
      expect(await provider.verify(artifact, signatures)).toBe(true);
    });
  },
);
