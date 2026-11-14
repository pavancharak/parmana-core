import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { canonicalSignatureBytes } from "../../src/providers/signature/canonicalSignatureBytes.js";
import { Ed25519SignatureProvider } from "../../src/providers/signature/Ed25519SignatureProvider.js";

const DATA = new TextEncoder().encode("authorization payload");

async function signed() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const provider = new Ed25519SignatureProvider();
  const signature = await provider.sign(DATA, privateKey);

  return { provider, publicKey, signature };
}

/**
 * Same signature bytes, different string: the trailing padding character is
 * replaced. Buffer.from(_, "base64") ignores it, so the bytes do not change.
 */
function sameBytesOtherString(signature: string): string {
  const last = signature.slice(-1) === "A" ? "B" : "A";
  return signature.slice(0, -1) + last;
}

describe("canonical signature encoding", () => {
  it("accepts the canonical encoding and returns the signature bytes", async () => {
    const { signature } = await signed();
    const bytes = canonicalSignatureBytes(signature);

    expect(bytes).toBeDefined();
    expect(bytes?.length).toBe(64);
  });

  it("refuses an encoding that decodes to the same bytes but is not canonical", async () => {
    const { signature } = await signed();
    const altered = sameBytesOtherString(signature);

    expect(altered).not.toBe(signature);
    expect(
      Buffer.from(altered, "base64").equals(Buffer.from(signature, "base64")),
    ).toBe(true);
    expect(canonicalSignatureBytes(altered)).toBeUndefined();
  });

  it("refuses an unpadded encoding of a valid signature", async () => {
    const { signature } = await signed();
    const unpadded = signature.replace(/=+$/, "");

    expect(canonicalSignatureBytes(unpadded)).toBeUndefined();
  });

  it("verifies the canonical signature", async () => {
    const { provider, publicKey, signature } = await signed();

    await expect(provider.verify(DATA, signature, publicKey)).resolves.toBe(
      true,
    );
  });

  it("refuses a non-canonical encoding of a valid signature", async () => {
    const { provider, publicKey, signature } = await signed();

    await expect(
      provider.verify(DATA, sameBytesOtherString(signature), publicKey),
    ).resolves.toBe(false);
  });
});
