// Known-bug reproduction: negative TTL and future authorizedAt are accepted.
// Uses it.fails: passes while the bug exists, and fails once the verifier is fixed (then switch to it).
import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi, afterEach } from "vitest";

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

afterEach(() => {
  vi.useRealTimers();
});

describe("repro: TTL and authorizedAt bounds", () => {
  it.fails(
    "[honest signer, clock skew] authorizedAt one hour in the future is accepted",
    async () => {
      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      const signer = new AuthorizationSigner(crypto);

      // Signer's clock is one hour ahead of the verifier's clock.
      const verifyAt = new Date("2026-11-06T12:00:00.000Z");
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(verifyAt.getTime() + 60 * 60 * 1000));
      const signed = await signer.sign(input(), privateKey, "key-1", 60);
      vi.setSystemTime(verifyAt);

      const payload = signed.payload;

      const verifier = new EnvelopeVerifier({
        publicKey,
        nonceStore: new MemoryNonceStore(),
      });
      const result = await verifier.verify(signed);
      expect(result.checks.ttlWithinPolicy).toBe(true);
      expect(result.valid).toBe(false); // what a fixed verifier should answer
    },
  );

  it.fails(
    "[signer that bypasses ttl check] negative TTL with future authorizedAt is accepted",
    async () => {
      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      const signer = new AuthorizationSigner(crypto);

      const honest: SignedExecutionAuthorization = await signer.sign(
        input(),
        privateKey,
        "key-1",
        60,
      );

      // Forge a payload with expiresAt BEFORE authorizedAt (TTL = -60s),
      // both in the future relative to the verifier's now, then sign it
      // with the same key. Models a signer that skips buildPayload's ttl>0 guard.
      const now = new Date("2026-11-06T12:00:00.000Z");
      const payload = {
        ...honest.payload,
        authorizedAt: new Date(now.getTime() + 120_000).toISOString(),
        expiresAt: new Date(now.getTime() + 60_000).toISOString(),
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

      const verifier = new EnvelopeVerifier({
        publicKey,
        nonceStore: new MemoryNonceStore(),
      });
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
      const result = await verifier.verify(forged);

      expect(result.checks.signatureVerified).toBe(true);
      expect(result.checks.notExpired).toBe(true);
      // Currently true (bug): TTL is -60s and still "within policy".
      expect(result.checks.ttlWithinPolicy).toBe(true);
      // What a fixed verifier should answer:
      expect(result.valid).toBe(false);
    },
  );
});
