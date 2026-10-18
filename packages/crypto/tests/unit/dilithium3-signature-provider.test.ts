import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { Dilithium3SignatureProvider } from "../../src/providers/signature/Dilithium3SignatureProvider.js";
import {
  isMlDsa65Supported,
  ML_DSA_65_SKIP_REASON,
} from "../../src/support/MlDsaSupport.js";

function generateKeyPair() {
  return generateKeyPairSync("ml-dsa-65");
}

describe.skipIf(!isMlDsa65Supported())(
  `Dilithium3SignatureProvider${isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`}`,
  () => {
    it("signs and verifies with caller-supplied keys", async () => {
      const provider = new Dilithium3SignatureProvider();
      const { privateKey, publicKey } = generateKeyPair();

      const data = Buffer.from("execution authorization payload");

      const signature = await provider.sign(data, privateKey);

      expect(await provider.verify(data, signature, publicKey)).toBe(true);
    });

    it("rejects a tampered message", async () => {
      const provider = new Dilithium3SignatureProvider();
      const { privateKey, publicKey } = generateKeyPair();

      const signature = await provider.sign(
        Buffer.from("original message"),
        privateKey,
      );

      expect(
        await provider.verify(
          Buffer.from("tampered message"),
          signature,
          publicKey,
        ),
      ).toBe(false);
    });

    it("rejects a signature produced by a different keypair", async () => {
      const provider = new Dilithium3SignatureProvider();
      const keyPairA = generateKeyPair();
      const keyPairB = generateKeyPair();

      const data = Buffer.from("execution authorization payload");

      const signature = await provider.sign(data, keyPairA.privateKey);

      expect(await provider.verify(data, signature, keyPairB.publicKey)).toBe(
        false,
      );
    });

    //
    // ML-DSA-65 signatures are randomized by design (unlike Ed25519,
    // which is deterministic). This is expected behavior, not a bug —
    // do not force determinism here.
    //
    it("produces a randomized (non-deterministic) signature for identical inputs", async () => {
      const provider = new Dilithium3SignatureProvider();
      const { privateKey, publicKey } = generateKeyPair();

      const data = Buffer.from("execution authorization payload");

      const signatureOne = await provider.sign(data, privateKey);
      const signatureTwo = await provider.sign(data, privateKey);

      expect(signatureOne).not.toBe(signatureTwo);

      // Both signatures remain independently valid despite differing.
      expect(await provider.verify(data, signatureOne, publicKey)).toBe(true);
      expect(await provider.verify(data, signatureTwo, publicKey)).toBe(true);
    });
  },
);
