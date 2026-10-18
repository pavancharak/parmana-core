import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AuthorizationSigner,
  CryptoBootstrap,
  isMlDsa65Supported,
  ML_DSA_65_SKIP_REASON,
} from "@parmana/crypto";

import type {
  ExecutableContent,
  SignedExecutionAuthorization,
} from "@parmana/shared";

import { EnvelopeVerifier } from "../../src/EnvelopeVerifier.js";
import { MemoryNonceStore } from "../../src/MemoryNonceStore.js";

/**
 * Duplicate of envelope-verifier.test.ts's provider-relevant cases,
 * run under SIGNATURE_PROVIDER=dilithium3 instead of the default
 * ed25519, to prove the envelope layer is provider-agnostic (R7).
 *
 * Mechanism: this env var assignment runs at this file's top level,
 * before the first call to CryptoBootstrap.create() below (which
 * caches the provider for the lifetime of this file's module
 * registry). Vitest isolates each test file into its own module
 * registry by default (no `isolate: false` in vitest.config.ts), so
 * this file's CryptoBootstrap cache is independent of
 * envelope-verifier.test.ts's — no cross-file interference, and no
 * vi.resetModules() needed here (that trick is reserved for
 * proving cross-instance behavior *within* a single file — see
 * packages/crypto/test/dilithium3-cross-instance.test.ts).
 */
process.env.PRIMARY_SIGNATURE_PROVIDER = "dilithium3";

const crypto = CryptoBootstrap.create();

function generateKeyPair() {
  return generateKeyPairSync("ml-dsa-65");
}

const SAMPLE_EXECUTABLE_CONTENT: ExecutableContent = {
  businessTransactionId: "txn-1",
  action: "TransferFunds",
  target: "account/12345",
  parameters: { amount: 100 },
};

async function signAuthorization(
  privateKey: ReturnType<typeof generateKeyPair>["privateKey"],
  ttlSeconds = 60,
): Promise<SignedExecutionAuthorization> {
  const signer = new AuthorizationSigner(crypto);

  return signer.sign(
    {
      decisionId: "decision-1",
      businessTransactionId: "txn-1",
      policyName: "policy-a",
      policyVersion: "1.0.0",
      executableContent: SAMPLE_EXECUTABLE_CONTENT,
    },
    privateKey,
    "key-1",
    ttlSeconds,
  );
}

describe.skipIf(!isMlDsa65Supported())(
  `EnvelopeVerifier (dilithium3)${isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`}`,
  () => {
    it("accepts a valid first-use envelope", async () => {
      const { privateKey, publicKey } = generateKeyPair();
      const signed = await signAuthorization(privateKey);

      expect(signed.algorithm).toBe("dilithium3");

      const verifier = new EnvelopeVerifier({
        publicKey,
        nonceStore: new MemoryNonceStore(),
      });

      const result = await verifier.verify(signed);

      expect(result.valid).toBe(true);
      expect(result.checks.signatureVerified).toBe(true);
      expect(result.checks.notExpired).toBe(true);
      expect(result.checks.ttlWithinPolicy).toBe(true);
      expect(result.checks.nonceUnseen).toBe(true);
    });

    it("rejects a second use of the same nonce", async () => {
      const { privateKey, publicKey } = generateKeyPair();
      const signed = await signAuthorization(privateKey);

      const nonceStore = new MemoryNonceStore();

      const verifier = new EnvelopeVerifier({
        publicKey,
        nonceStore,
      });

      const first = await verifier.verify(signed);
      expect(first.valid).toBe(true);

      const second = await verifier.verify(signed);

      expect(second.valid).toBe(false);
      expect(second.checks.nonceUnseen).toBe(false);
      expect(second.checks.signatureVerified).toBe(true);
      expect(second.checks.notExpired).toBe(true);
      expect(second.checks.ttlWithinPolicy).toBe(true);
    });

    it("a forged envelope does not burn the nonce", async () => {
      const { privateKey, publicKey } = generateKeyPair();
      const signed = await signAuthorization(privateKey);

      const tampered: SignedExecutionAuthorization = {
        ...signed,
        payload: {
          ...signed.payload,
          decisionId: "decision-2",
        },
      };

      const nonceStore = new MemoryNonceStore();

      const verifier = new EnvelopeVerifier({
        publicKey,
        nonceStore,
      });

      const forgedResult = await verifier.verify(tampered);

      expect(forgedResult.valid).toBe(false);
      expect(forgedResult.checks.signatureVerified).toBe(false);
      expect(forgedResult.checks.nonceUnseen).toBe(false);

      const originalResult = await verifier.verify(signed);

      expect(originalResult.valid).toBe(true);
      expect(originalResult.checks.nonceUnseen).toBe(true);
    });

    it("an expired envelope does not burn the nonce", async () => {
      const { privateKey, publicKey } = generateKeyPair();
      const signed = await signAuthorization(privateKey, 60);

      const nonceStore = new MemoryNonceStore();

      const verifier = new EnvelopeVerifier({
        publicKey,
        nonceStore,
      });

      const farFuture = new Date(
        Date.parse(signed.payload.authorizedAt) + 120_000,
      );

      const expiredResult = await verifier.verify(signed, farFuture);

      expect(expiredResult.valid).toBe(false);
      expect(expiredResult.checks.signatureVerified).toBe(true);
      expect(expiredResult.checks.notExpired).toBe(false);
      expect(expiredResult.checks.nonceUnseen).toBe(false);

      const withinValidity = new Date(
        Date.parse(signed.payload.authorizedAt) + 1_000,
      );

      const originalResult = await verifier.verify(signed, withinValidity);

      expect(originalResult.valid).toBe(true);
      expect(originalResult.checks.nonceUnseen).toBe(true);
    });

    it("rejects an envelope whose TTL exceeds maxTtlSeconds", async () => {
      const { privateKey, publicKey } = generateKeyPair();
      const signed = await signAuthorization(privateKey, 3600);

      const verifier = new EnvelopeVerifier({
        publicKey,
        nonceStore: new MemoryNonceStore(),
        maxTtlSeconds: 300,
      });

      const result = await verifier.verify(signed);

      expect(result.valid).toBe(false);
      expect(result.checks.ttlWithinPolicy).toBe(false);
      expect(result.checks.signatureVerified).toBe(true);
      expect(result.checks.nonceUnseen).toBe(false);
    });
  },
);
