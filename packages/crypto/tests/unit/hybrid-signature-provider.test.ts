import { generateKeyPairSync, type KeyObject } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CryptoBuilder } from "../../src/CryptoBuilder.js";
import { HybridSignatureProvider } from "../../src/HybridSignatureProvider.js";
import type { HybridCryptoProvider } from "../../src/models/HybridCryptoProvider.js";
import { SHA256HashProvider } from "../../src/providers/hash/SHA256HashProvider.js";
import { Dilithium3SignatureProvider } from "../../src/providers/signature/Dilithium3SignatureProvider.js";
import { Ed25519SignatureProvider } from "../../src/providers/signature/Ed25519SignatureProvider.js";
import type { KeyMetadata, KeyProvider } from "../../src/KeyProvider.js";
import {
  isMlDsa65Supported,
  ML_DSA_65_SKIP_REASON,
} from "../../src/support/MlDsaSupport.js";

/**
 * Minimal in-memory KeyProvider, keyed by keyId, standing in for
 * FileKeyProvider -- HybridSignatureProvider only depends on the
 * KeyProvider interface, never the filesystem directly.
 */
class MapKeyProvider implements KeyProvider {
  private readonly privateKeys = new Map<string, KeyObject>();
  private readonly publicKeys = new Map<string, KeyObject>();

  set(keyId: string, privateKey: KeyObject, publicKey: KeyObject): void {
    this.privateKeys.set(keyId, privateKey);
    this.publicKeys.set(keyId, publicKey);
  }

  async getMetadata(keyId: string): Promise<KeyMetadata> {
    throw new Error(`getMetadata not implemented for test double: ${keyId}`);
  }

  async getPrivateKey(keyId: string): Promise<KeyObject> {
    const key = this.privateKeys.get(keyId);

    if (!key) {
      throw new Error(`Private key not found: ${keyId}`);
    }

    return key;
  }

  async getPublicKey(keyId: string): Promise<KeyObject> {
    const key = this.publicKeys.get(keyId);

    if (!key) {
      throw new Error(`Public key not found: ${keyId}`);
    }

    return key;
  }

  async hasKey(keyId: string): Promise<boolean> {
    return this.privateKeys.has(keyId);
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

function buildKeys(): MapKeyProvider {
  const ed25519 = generateKeyPairSync("ed25519");
  const dilithium3 = generateKeyPairSync("ml-dsa-65");

  const keys = new MapKeyProvider();
  keys.set(PRIMARY_KEY_ID, ed25519.privateKey, ed25519.publicKey);
  keys.set(SECONDARY_KEY_ID, dilithium3.privateKey, dilithium3.publicKey);

  return keys;
}

describe.skipIf(!isMlDsa65Supported())(
  `HybridSignatureProvider${isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`}`,
  () => {
    it("signs with both algorithms and verifies successfully", async () => {
      const crypto = buildHybridCrypto();
      const keys = buildKeys();
      const provider = new HybridSignatureProvider(crypto, keys);

      const artifact = { businessTransactionId: "bt-1", amount: 100 };

      const signatures = await provider.sign(
        artifact,
        PRIMARY_KEY_ID,
        SECONDARY_KEY_ID,
      );

      expect(signatures).toHaveLength(2);
      expect(signatures.map((entry) => entry.algorithm).sort()).toEqual(
        ["dilithium3", "ed25519"].sort(),
      );

      expect(await provider.verify(artifact, signatures)).toBe(true);
    });

    it("rejects when the secondary signature is tampered (proven to fail without the fix)", async () => {
      const crypto = buildHybridCrypto();
      const keys = buildKeys();
      const provider = new HybridSignatureProvider(crypto, keys);

      const artifact = { businessTransactionId: "bt-1", amount: 100 };
      const signatures = await provider.sign(
        artifact,
        PRIMARY_KEY_ID,
        SECONDARY_KEY_ID,
      );

      const tampered = signatures.map((entry) =>
        entry.algorithm === "dilithium3"
          ? { ...entry, signature: `${entry.signature.slice(0, -4)}AAAA` }
          : entry,
      );

      expect(await provider.verify(artifact, tampered)).toBe(false);
    });

    it("rejects when the second signature is missing entirely, not a silent downgrade to single-signature verification", async () => {
      const crypto = buildHybridCrypto();
      const keys = buildKeys();
      const provider = new HybridSignatureProvider(crypto, keys);

      const artifact = { businessTransactionId: "bt-1", amount: 100 };
      const signatures = await provider.sign(
        artifact,
        PRIMARY_KEY_ID,
        SECONDARY_KEY_ID,
      );

      const onlyPrimary = signatures.filter(
        (entry) => entry.algorithm === "ed25519",
      );

      expect(onlyPrimary).toHaveLength(1);
      expect(await provider.verify(artifact, onlyPrimary)).toBe(false);
    });

    it("rejects a duplicated single-algorithm array (two ed25519 entries, no dilithium3)", async () => {
      const crypto = buildHybridCrypto();
      const keys = buildKeys();
      const provider = new HybridSignatureProvider(crypto, keys);

      const artifact = { businessTransactionId: "bt-1", amount: 100 };
      const signatures = await provider.sign(
        artifact,
        PRIMARY_KEY_ID,
        SECONDARY_KEY_ID,
      );

      const primaryOnly = signatures.find(
        (entry) => entry.algorithm === "ed25519",
      )!;

      expect(await provider.verify(artifact, [primaryOnly, primaryOnly])).toBe(
        false,
      );
    });

    it("rejects a signature produced by a different keypair", async () => {
      const crypto = buildHybridCrypto();
      const keys = buildKeys();
      const provider = new HybridSignatureProvider(crypto, keys);

      const artifact = { businessTransactionId: "bt-1", amount: 100 };
      const signatures = await provider.sign(
        artifact,
        PRIMARY_KEY_ID,
        SECONDARY_KEY_ID,
      );

      // Re-key the secondary slot with an unrelated keypair after
      // signing, then verify against the original signature -- the
      // public key on file no longer matches what actually signed.
      const rogueDilithium = generateKeyPairSync("ml-dsa-65");
      keys.set(
        SECONDARY_KEY_ID,
        rogueDilithium.privateKey,
        rogueDilithium.publicKey,
      );

      expect(await provider.verify(artifact, signatures)).toBe(false);
    });

    it("rejects a tampered artifact even with otherwise-valid signatures", async () => {
      const crypto = buildHybridCrypto();
      const keys = buildKeys();
      const provider = new HybridSignatureProvider(crypto, keys);

      const signatures = await provider.sign(
        { amount: 100 },
        PRIMARY_KEY_ID,
        SECONDARY_KEY_ID,
      );

      expect(await provider.verify({ amount: 999 }, signatures)).toBe(false);
    });

    it("fails closed (throws) when the secondary key file is missing, rather than silently signing with one algorithm", async () => {
      const crypto = buildHybridCrypto();
      const keys = new MapKeyProvider();

      const ed25519 = generateKeyPairSync("ed25519");
      keys.set(PRIMARY_KEY_ID, ed25519.privateKey, ed25519.publicKey);
      // SECONDARY_KEY_ID deliberately never set -- simulates a missing
      // default-secondary.private.pem under PARMANA_KEY_DIR.

      const provider = new HybridSignatureProvider(crypto, keys);

      await expect(
        provider.sign({ amount: 100 }, PRIMARY_KEY_ID, SECONDARY_KEY_ID),
      ).rejects.toThrow(`Private key not found: ${SECONDARY_KEY_ID}`);
    });
  },
);
