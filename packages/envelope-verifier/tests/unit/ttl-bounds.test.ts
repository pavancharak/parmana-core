// Regression tests: the envelope verifier must reject a negative TTL and an
// authorizedAt in the future beyond the clock-skew allowance.
import { generateKeyPairSync } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthorizationSigner, CryptoBootstrap } from "@parmana/crypto";
import type { SignedExecutionAuthorization } from "@parmana/shared";

import { EnvelopeVerifier } from "../../src/EnvelopeVerifier.js";
import { MemoryNonceStore } from "../../src/MemoryNonceStore.js";

const crypto = CryptoBootstrap.create();

const CONTENT = {
  businessTransactionId: "txn-1",
  action: "TransferFunds",
  target: "account/12345",
  parameters: { amount: 100 },
};

function input() {
  return {
    decisionId: "decision-1",
    businessTransactionId: "txn-1",
    policyName: "policy-a",
    policyVersion: "1.0.0",
    executableContent: CONTENT,
  };
}

const NOW = new Date("2026-11-06T12:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
});

describe("EnvelopeVerifier TTL and authorizedAt bounds", () => {
  it("still accepts an honest, currently-issued envelope", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const signer = new AuthorizationSigner(crypto);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const signed = await signer.sign(input(), privateKey, "key-1", 60);

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
    });
    const result = await verifier.verify(signed);

    expect(result.checks.ttlWithinPolicy).toBe(true);
    expect(result.valid).toBe(true);
  });

  it("rejects an authorizedAt one hour in the future (signer clock ahead)", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const signer = new AuthorizationSigner(crypto);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW.getTime() + 60 * 60 * 1000));
    const signed = await signer.sign(input(), privateKey, "key-1", 60);
    vi.setSystemTime(NOW);

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
    });
    const result = await verifier.verify(signed);

    expect(result.checks.ttlWithinPolicy).toBe(false);
    expect(result.valid).toBe(false);
  });

  it("rejects a negative TTL, even when correctly signed", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const signer = new AuthorizationSigner(crypto);
    const honest: SignedExecutionAuthorization = await signer.sign(
      input(),
      privateKey,
      "key-1",
      60,
    );

    // expiresAt is 60s before authorizedAt. Signed with the real key, as a
    // signer that skipped buildPayload's ttl > 0 guard would produce.
    const payload = {
      ...honest.payload,
      authorizedAt: new Date(NOW.getTime() + 120_000).toISOString(),
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    };
    const rawSigner = (
      signer as unknown as {
        signer: { sign: (p: unknown, k: unknown) => Promise<unknown> };
      }
    ).signer;
    const signature = await rawSigner.sign(payload, privateKey);
    const forged = {
      ...honest,
      payload,
      signature,
    } as SignedExecutionAuthorization;

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
    });
    const result = await verifier.verify(forged);

    expect(result.checks.signatureVerified).toBe(true);
    expect(result.checks.notExpired).toBe(true);
    expect(result.checks.ttlWithinPolicy).toBe(false);
    expect(result.valid).toBe(false);
  });
});
