import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CryptoError } from "../../src/errors/CryptoError.js";
import { Dilithium3SignatureProvider } from "../../src/providers/signature/Dilithium3SignatureProvider.js";
import { Ed25519SignatureProvider } from "../../src/providers/signature/Ed25519SignatureProvider.js";
import {
  isMlDsa65Supported,
  ML_DSA_65_SKIP_REASON,
} from "../../src/support/MlDsaSupport.js";

const data = Buffer.from("payload bytes to sign");

describe("SignatureProvider key/algorithm binding (R8)", () => {
  it.skipIf(!isMlDsa65Supported())(
    `Ed25519SignatureProvider.sign() rejects a dilithium3 (ml-dsa-65) key${isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`}`,
    async () => {
      const provider = new Ed25519SignatureProvider();
      const { privateKey } = generateKeyPairSync("ml-dsa-65");

      await expect(provider.sign(data, privateKey)).rejects.toThrow(
        CryptoError,
      );

      await expect(provider.sign(data, privateKey)).rejects.toThrow(
        /expected a "ed25519" key but received "ml-dsa-65"/,
      );
    },
  );

  it.skipIf(!isMlDsa65Supported())(
    `Ed25519SignatureProvider.verify() rejects a dilithium3 (ml-dsa-65) key${isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`}`,
    async () => {
      const provider = new Ed25519SignatureProvider();
      const { publicKey } = generateKeyPairSync("ml-dsa-65");

      await expect(
        provider.verify(data, "irrelevant-signature", publicKey),
      ).rejects.toThrow(CryptoError);

      await expect(
        provider.verify(data, "irrelevant-signature", publicKey),
      ).rejects.toThrow(/expected a "ed25519" key but received "ml-dsa-65"/);
    },
  );

  it("Dilithium3SignatureProvider.sign() rejects an ed25519 key", async () => {
    const provider = new Dilithium3SignatureProvider();
    const { privateKey } = generateKeyPairSync("ed25519");

    await expect(provider.sign(data, privateKey)).rejects.toThrow(CryptoError);

    await expect(provider.sign(data, privateKey)).rejects.toThrow(
      /expected a "ml-dsa-65" key but received "ed25519"/,
    );
  });

  it("Dilithium3SignatureProvider.verify() rejects an ed25519 key", async () => {
    const provider = new Dilithium3SignatureProvider();
    const { publicKey } = generateKeyPairSync("ed25519");

    await expect(
      provider.verify(data, "irrelevant-signature", publicKey),
    ).rejects.toThrow(CryptoError);

    await expect(
      provider.verify(data, "irrelevant-signature", publicKey),
    ).rejects.toThrow(/expected a "ml-dsa-65" key but received "ed25519"/);
  });
});
