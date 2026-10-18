import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ArtifactSigner } from "../../src/ArtifactSigner.js";
import { CryptoBootstrap } from "../../src/CryptoBootstrap.js";
import { SignatureVerifier } from "../../src/SignatureVerifier.js";
import {
  KMS_RAW_MESSAGE_LIMIT_BYTES,
  commitmentMessage,
  requiresCommitment,
} from "../../src/SignatureCommitment.js";
import { Ed25519SignatureProvider } from "../../src/providers/signature/Ed25519SignatureProvider.js";
import type { Signer } from "../../src/Signer.js";

const provider = new Ed25519SignatureProvider();

function bytes(length: number, fill = 7): Uint8Array {
  return new Uint8Array(length).fill(fill);
}

function rawSign(data: Uint8Array, key: KeyObject): string {
  return sign(null, Buffer.from(data), key).toString("base64");
}

/**
 * Behaves like AWS KMS for an Ed25519 key: it signs the message it is
 * given, and refuses a message over the 4096 byte raw limit exactly as
 * the real service does. Signs the commitment when the caller hands it
 * a large message, via the same helper KmsSigner uses.
 */
function kmsLikeSigner(privateKey: KeyObject): Signer {
  return {
    async sign(_keyId: string, data: Uint8Array): Promise<string> {
      const message = requiresCommitment(data) ? commitmentMessage(data) : data;

      if (message.length > KMS_RAW_MESSAGE_LIMIT_BYTES) {
        throw new Error("Member must have length less than or equal to 4096");
      }

      return rawSign(message, privateKey);
    },
  } as unknown as Signer;
}

describe("large message commitment", () => {
  it("uses a fixed size commitment far below the KMS limit", () => {
    expect(commitmentMessage(bytes(5000)).length).toBe(
      commitmentMessage(bytes(500_000)).length,
    );
    expect(commitmentMessage(bytes(5000)).length).toBeLessThan(200);
  });

  it("changes when any byte of the message changes", () => {
    const a = bytes(5000);
    const b = bytes(5000);
    b[4999] = 8;

    expect(Buffer.from(commitmentMessage(a))).not.toEqual(
      Buffer.from(commitmentMessage(b)),
    );
  });

  it("applies the commitment only strictly above the limit", () => {
    expect(requiresCommitment(bytes(4096))).toBe(false);
    expect(requiresCommitment(bytes(4097))).toBe(true);
  });
});

describe("Ed25519 verification of commitment signatures", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  it("still verifies a small message signed raw (unchanged)", async () => {
    const data = bytes(1000);

    expect(
      await provider.verify(data, rawSign(data, privateKey), publicKey),
    ).toBe(true);
  });

  it("still verifies a large message signed raw by a local key (backward compatible)", async () => {
    const data = bytes(20_000);

    expect(
      await provider.verify(data, rawSign(data, privateKey), publicKey),
    ).toBe(true);
  });

  it("verifies a large message signed as a commitment", async () => {
    const data = bytes(20_000);
    const signature = rawSign(commitmentMessage(data), privateKey);

    expect(await provider.verify(data, signature, publicKey)).toBe(true);
  });

  it("rejects a commitment signature when the large message was modified", async () => {
    const data = bytes(20_000);
    const signature = rawSign(commitmentMessage(data), privateKey);
    const tampered = bytes(20_000);
    tampered[10] = 9;

    expect(await provider.verify(tampered, signature, publicKey)).toBe(false);
  });

  it("rejects a commitment signature over a message at or below the limit (no downgrade)", async () => {
    const small = bytes(4096);
    const signature = rawSign(commitmentMessage(small), privateKey);

    expect(await provider.verify(small, signature, publicKey)).toBe(false);
  });

  it("rejects a commitment signature made by a different key", async () => {
    const other = generateKeyPairSync("ed25519");
    const data = bytes(20_000);
    const signature = rawSign(commitmentMessage(data), other.privateKey);

    expect(await provider.verify(data, signature, publicKey)).toBe(false);
  });

  it("rejects a signature over a different large message", async () => {
    const a = bytes(20_000, 1);
    const b = bytes(20_000, 2);
    const signature = rawSign(commitmentMessage(a), privateKey);

    expect(await provider.verify(b, signature, publicKey)).toBe(false);
  });
});

describe("KMS style signing of a large canonical artifact end to end", () => {
  it("signs and verifies an artifact over 4096 bytes through Signer and SignatureVerifier", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const crypto = CryptoBootstrap.create();

    const artifact = {
      trustRecordId: "record-1",
      evidence: "x".repeat(30_000),
    };

    const signature = await new ArtifactSigner(crypto).signWithSigner(
      artifact,
      "default",
      kmsLikeSigner(privateKey),
    );

    const verifier = new SignatureVerifier(crypto);

    expect(await verifier.verify(artifact, signature, publicKey)).toBe(true);
    expect(
      await verifier.verify(
        { ...artifact, evidence: "y" },
        signature,
        publicKey,
      ),
    ).toBe(false);
  });

  it("a signer without the commitment fix fails on the same artifact, as KMS did in production", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const crypto = CryptoBootstrap.create();

    const naiveKms = {
      async sign(_keyId: string, data: Uint8Array) {
        if (data.length > KMS_RAW_MESSAGE_LIMIT_BYTES) {
          throw new Error("Member must have length less than or equal to 4096");
        }
        return rawSign(data, privateKey);
      },
    } as unknown as Signer;

    await expect(
      new ArtifactSigner(crypto).signWithSigner(
        { evidence: "x".repeat(30_000) },
        "default",
        naiveKms,
      ),
    ).rejects.toThrow(/4096/);
  });
});
