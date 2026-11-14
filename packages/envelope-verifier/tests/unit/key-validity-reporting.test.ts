import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AuthorizationSigner,
  CryptoBootstrap,
  type KeyMetadata,
  type KeyProvider,
} from "@parmana/crypto";

import type {
  ExecutableContent,
  SignedExecutionAuthorization,
} from "@parmana/shared";

import { EnvelopeVerifier } from "../../src/EnvelopeVerifier.js";
import { MemoryNonceStore } from "../../src/MemoryNonceStore.js";

const crypto = CryptoBootstrap.create();

const CONTENT: ExecutableContent = {
  businessTransactionId: "txn-1",
  action: "TransferFunds",
  target: "account/12345",
  parameters: { amount: 100 },
};

function generateKeyPair() {
  return generateKeyPairSync("ed25519");
}

async function sign(
  privateKey: ReturnType<typeof generateKeyPair>["privateKey"],
  keyId: string,
): Promise<SignedExecutionAuthorization> {
  return new AuthorizationSigner(crypto).sign(
    {
      decisionId: "decision-1",
      businessTransactionId: "txn-1",
      policyName: "policy-a",
      policyVersion: "1.0.0",
      executableContent: CONTENT,
    },
    privateKey,
    keyId,
    60,
  );
}

class OneKeyProvider implements KeyProvider {
  constructor(
    private readonly keyId: string,
    private readonly publicKey: ReturnType<typeof generateKeyPair>["publicKey"],
  ) {}

  async getMetadata(keyId: string): Promise<KeyMetadata> {
    return { keyId, algorithm: "ed25519" };
  }

  async getPrivateKey(): Promise<never> {
    throw new Error("not implemented for this test double");
  }

  async getPublicKey(keyId: string) {
    if (keyId !== this.keyId) {
      throw new Error(`Key not found: ${keyId}`);
    }
    return this.publicKey;
  }

  async hasKey(keyId: string): Promise<boolean> {
    return keyId === this.keyId;
  }
}

describe("EnvelopeVerifier key-validity reporting", () => {
  it("omitting keyProvider leaves keyValid out of checks entirely, not present as undefined", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await sign(privateKey, "key-1");

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
    });

    const { checks, passed } = await verifier.verifyChecks(signed);

    expect(passed).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(checks, "keyValid")).toBe(
      false,
    );
  });

  it("with keyProvider, a key it can resolve is reported as keyValid true", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await sign(privateKey, "key-1");

    const verifier = new EnvelopeVerifier({
      publicKey: generateKeyPair().publicKey,
      keyProvider: new OneKeyProvider("key-1", publicKey),
      nonceStore: new MemoryNonceStore(),
    });

    const { checks, passed } = await verifier.verifyChecks(signed);

    expect(passed).toBe(true);
    expect(checks.keyValid).toBe(true);
  });

  it("with keyProvider, an unknown key is reported as keyValid false and fails the envelope", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await sign(privateKey, "unknown-key");

    const verifier = new EnvelopeVerifier({
      publicKey: generateKeyPair().publicKey,
      keyProvider: new OneKeyProvider("key-1", publicKey),
      nonceStore: new MemoryNonceStore(),
    });

    const { checks, passed } = await verifier.verifyChecks(signed);

    expect(passed).toBe(false);
    expect(checks.keyValid).toBe(false);
  });
});
