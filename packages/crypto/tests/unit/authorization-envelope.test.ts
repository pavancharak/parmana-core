import { generateKeyPairSync } from "node:crypto";

import { describe, it, expect } from "vitest";

import {
  ArtifactSigner,
  AuthorizationSigner,
  AuthorizationVerifier,
  CryptoBootstrap,
} from "../../src/index.js";

import type {
  ExecutableContent,
  ExecutionAuthorizationPayload,
  SignedExecutionAuthorization,
} from "@parmana/shared";

const crypto = CryptoBootstrap.create();

function generateKeyPair() {
  return generateKeyPairSync("ed25519");
}

const SAMPLE_EXECUTABLE_CONTENT: ExecutableContent = {
  businessTransactionId: "txn-1",
  action: "TransferFunds",
  target: "account/12345",
  parameters: { amount: 100 },
};

describe("Execution Authorization Envelope", () => {
  it("signs and verifies a round-tripped authorization", async () => {
    const { privateKey, publicKey } = generateKeyPair();

    const signer = new AuthorizationSigner(crypto);
    const verifier = new AuthorizationVerifier(crypto);

    const signed = await signer.sign(
      {
        decisionId: "decision-1",
        businessTransactionId: "txn-1",
        policyName: "policy-a",
        policyVersion: "1.0.0",
        executableContent: SAMPLE_EXECUTABLE_CONTENT,
      },
      privateKey,
      "key-1",
      60,
    );

    const transported = JSON.parse(
      JSON.stringify(signed),
    ) as SignedExecutionAuthorization;

    const result = await verifier.verify(transported, publicKey);

    expect(result.valid).toBe(true);
    expect(result.checks.signatureVerified).toBe(true);
    expect(result.checks.notExpired).toBe(true);
  });

  it("produces a deterministic signature for identical payloads", async () => {
    const { privateKey } = generateKeyPair();

    const payload: ExecutionAuthorizationPayload = {
      version: 1,
      authorizationId: "auth-fixed",
      nonce: "nonce-fixed",
      decisionId: "decision-fixed",
      businessTransactionId: "txn-fixed",
      policyName: "policy-fixed",
      policyVersion: "1.0.0",
      authorizedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:01:00.000Z",
      businessTransactionHash: "hash-fixed",
    };

    const artifactSigner = new ArtifactSigner(crypto);

    const signatureOne = await artifactSigner.sign(payload, privateKey);

    const signatureTwo = await artifactSigner.sign(payload, privateKey);

    expect(signatureOne).toBe(signatureTwo);
  });

  it("rejects a tampered decisionId", async () => {
    const { privateKey, publicKey } = generateKeyPair();

    const signer = new AuthorizationSigner(crypto);
    const verifier = new AuthorizationVerifier(crypto);

    const signed = await signer.sign(
      {
        decisionId: "decision-1",
        businessTransactionId: "txn-1",
        policyName: "policy-a",
        policyVersion: "1.0.0",
        executableContent: SAMPLE_EXECUTABLE_CONTENT,
      },
      privateKey,
      "key-1",
      60,
    );

    const tampered: SignedExecutionAuthorization = {
      ...signed,
      payload: {
        ...signed.payload,
        decisionId: "decision-2",
      },
    };

    const result = await verifier.verify(tampered, publicKey);

    expect(result.valid).toBe(false);
    expect(result.checks.signatureVerified).toBe(false);
  });

  it("rejects a tampered expiresAt", async () => {
    const { privateKey, publicKey } = generateKeyPair();

    const signer = new AuthorizationSigner(crypto);
    const verifier = new AuthorizationVerifier(crypto);

    const signed = await signer.sign(
      {
        decisionId: "decision-1",
        businessTransactionId: "txn-1",
        policyName: "policy-a",
        policyVersion: "1.0.0",
        executableContent: SAMPLE_EXECUTABLE_CONTENT,
      },
      privateKey,
      "key-1",
      60,
    );

    const extendedExpiry = new Date(
      Date.parse(signed.payload.expiresAt) + 365 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const tampered: SignedExecutionAuthorization = {
      ...signed,
      payload: {
        ...signed.payload,
        expiresAt: extendedExpiry,
      },
    };

    const result = await verifier.verify(tampered, publicKey);

    expect(result.valid).toBe(false);
    expect(result.checks.signatureVerified).toBe(false);
  });

  it("rejects an expired authorization with a valid signature", async () => {
    const { privateKey, publicKey } = generateKeyPair();

    const signer = new AuthorizationSigner(crypto);
    const verifier = new AuthorizationVerifier(crypto);

    const signed = await signer.sign(
      {
        decisionId: "decision-1",
        businessTransactionId: "txn-1",
        policyName: "policy-a",
        policyVersion: "1.0.0",
        executableContent: SAMPLE_EXECUTABLE_CONTENT,
      },
      privateKey,
      "key-1",
      60,
    );

    const now = new Date(Date.parse(signed.payload.authorizedAt) + 120_000);

    const result = await verifier.verify(signed, publicKey, now);

    expect(result.valid).toBe(false);
    expect(result.checks.signatureVerified).toBe(true);
    expect(result.checks.notExpired).toBe(false);
  });

  it("rejects an unknown payload version before verifying the signature", async () => {
    const { privateKey, publicKey } = generateKeyPair();

    const signer = new AuthorizationSigner(crypto);
    const verifier = new AuthorizationVerifier(crypto);

    const signed = await signer.sign(
      {
        decisionId: "decision-1",
        businessTransactionId: "txn-1",
        policyName: "policy-a",
        policyVersion: "1.0.0",
        executableContent: SAMPLE_EXECUTABLE_CONTENT,
      },
      privateKey,
      "key-1",
      60,
    );

    const tampered = {
      ...signed,
      payload: {
        ...signed.payload,
        version: 2,
      },
    } as unknown as SignedExecutionAuthorization;

    const result = await verifier.verify(tampered, publicKey);

    expect(result.valid).toBe(false);
    expect(result.checks.versionSupported).toBe(false);
    expect(result.checks.signatureVerified).toBe(false);
    expect(result.checks.notExpired).toBe(false);
  });

  it("rejects a signature from a different key", async () => {
    const keyPairA = generateKeyPair();
    const keyPairB = generateKeyPair();

    const signer = new AuthorizationSigner(crypto);
    const verifier = new AuthorizationVerifier(crypto);

    const signed = await signer.sign(
      {
        decisionId: "decision-1",
        businessTransactionId: "txn-1",
        policyName: "policy-a",
        policyVersion: "1.0.0",
        executableContent: SAMPLE_EXECUTABLE_CONTENT,
      },
      keyPairA.privateKey,
      "key-1",
      60,
    );

    const result = await verifier.verify(signed, keyPairB.publicKey);

    expect(result.checks.signatureVerified).toBe(false);
  });

  it("includes signalsHash in the signed payload when supplied, and verifies unchanged", async () => {
    const { privateKey, publicKey } = generateKeyPair();

    const signer = new AuthorizationSigner(crypto);
    const verifier = new AuthorizationVerifier(crypto);

    const signed = await signer.sign(
      {
        decisionId: "decision-1",
        businessTransactionId: "txn-1",
        policyName: "policy-a",
        policyVersion: "1.0.0",
        signalsHash: "signals-hash-fixed",
        executableContent: SAMPLE_EXECUTABLE_CONTENT,
      },
      privateKey,
      "key-1",
      60,
    );

    expect(signed.payload.signalsHash).toBe("signals-hash-fixed");

    const result = await verifier.verify(signed, publicKey);

    expect(result.valid).toBe(true);
  });

  it("omits signalsHash from the payload when not supplied (backward compatible)", async () => {
    const { privateKey } = generateKeyPair();

    const signer = new AuthorizationSigner(crypto);

    const signed = await signer.sign(
      {
        decisionId: "decision-1",
        businessTransactionId: "txn-1",
        policyName: "policy-a",
        policyVersion: "1.0.0",
        executableContent: SAMPLE_EXECUTABLE_CONTENT,
      },
      privateKey,
      "key-1",
      60,
    );

    expect(signed.payload.signalsHash).toBeUndefined();
  });

  it("rejects a tampered signalsHash", async () => {
    const { privateKey, publicKey } = generateKeyPair();

    const signer = new AuthorizationSigner(crypto);
    const verifier = new AuthorizationVerifier(crypto);

    const signed = await signer.sign(
      {
        decisionId: "decision-1",
        businessTransactionId: "txn-1",
        policyName: "policy-a",
        policyVersion: "1.0.0",
        signalsHash: "signals-hash-fixed",
        executableContent: SAMPLE_EXECUTABLE_CONTENT,
      },
      privateKey,
      "key-1",
      60,
    );

    const tampered: SignedExecutionAuthorization = {
      ...signed,
      payload: {
        ...signed.payload,
        signalsHash: "signals-hash-tampered",
      },
    };

    const result = await verifier.verify(tampered, publicKey);

    expect(result.valid).toBe(false);
    expect(result.checks.signatureVerified).toBe(false);
  });

  it("includes submittedBy/grantedCapability in the signed payload when supplied, and verifies unchanged", async () => {
    const { privateKey, publicKey } = generateKeyPair();

    const signer = new AuthorizationSigner(crypto);
    const verifier = new AuthorizationVerifier(crypto);

    const signed = await signer.sign(
      {
        decisionId: "decision-1",
        businessTransactionId: "txn-1",
        policyName: "policy-a",
        policyVersion: "1.0.0",
        submittedBy: "caller-alice",
        grantedCapability: "TransferFunds",
        executableContent: SAMPLE_EXECUTABLE_CONTENT,
      },
      privateKey,
      "key-1",
      60,
    );

    expect(signed.payload.submittedBy).toBe("caller-alice");
    expect(signed.payload.grantedCapability).toBe("TransferFunds");

    const result = await verifier.verify(signed, publicKey);

    expect(result.valid).toBe(true);
  });

  it("omits submittedBy/grantedCapability from the payload when not supplied (backward compatible)", async () => {
    const { privateKey } = generateKeyPair();

    const signer = new AuthorizationSigner(crypto);

    const signed = await signer.sign(
      {
        decisionId: "decision-1",
        businessTransactionId: "txn-1",
        policyName: "policy-a",
        policyVersion: "1.0.0",
        executableContent: SAMPLE_EXECUTABLE_CONTENT,
      },
      privateKey,
      "key-1",
      60,
    );

    expect(signed.payload.submittedBy).toBeUndefined();
    expect(signed.payload.grantedCapability).toBeUndefined();
  });

  it("rejects a tampered submittedBy", async () => {
    const { privateKey, publicKey } = generateKeyPair();

    const signer = new AuthorizationSigner(crypto);
    const verifier = new AuthorizationVerifier(crypto);

    const signed = await signer.sign(
      {
        decisionId: "decision-1",
        businessTransactionId: "txn-1",
        policyName: "policy-a",
        policyVersion: "1.0.0",
        submittedBy: "caller-alice",
        executableContent: SAMPLE_EXECUTABLE_CONTENT,
      },
      privateKey,
      "key-1",
      60,
    );

    const tampered: SignedExecutionAuthorization = {
      ...signed,
      payload: {
        ...signed.payload,
        submittedBy: "caller-eve",
      },
    };

    const result = await verifier.verify(tampered, publicKey);

    expect(result.valid).toBe(false);
    expect(result.checks.signatureVerified).toBe(false);
  });

  it("rejects a tampered grantedCapability", async () => {
    const { privateKey, publicKey } = generateKeyPair();

    const signer = new AuthorizationSigner(crypto);
    const verifier = new AuthorizationVerifier(crypto);

    const signed = await signer.sign(
      {
        decisionId: "decision-1",
        businessTransactionId: "txn-1",
        policyName: "policy-a",
        policyVersion: "1.0.0",
        submittedBy: "caller-alice",
        grantedCapability: "ReadBalance",
        executableContent: SAMPLE_EXECUTABLE_CONTENT,
      },
      privateKey,
      "key-1",
      60,
    );

    const tampered: SignedExecutionAuthorization = {
      ...signed,
      payload: {
        ...signed.payload,
        grantedCapability: "TransferFunds",
      },
    };

    const result = await verifier.verify(tampered, publicKey);

    expect(result.valid).toBe(false);
    expect(result.checks.signatureVerified).toBe(false);
  });

  it("rejects non-positive TTL", async () => {
    const { privateKey } = generateKeyPair();

    const signer = new AuthorizationSigner(crypto);

    await expect(
      signer.sign(
        {
          decisionId: "decision-1",
          businessTransactionId: "txn-1",
          policyName: "policy-a",
          policyVersion: "1.0.0",
          executableContent: SAMPLE_EXECUTABLE_CONTENT,
        },
        privateKey,
        "key-1",
        0,
      ),
    ).rejects.toThrow();
  });
});
