import { generateKeyPairSync } from "node:crypto";

import { describe, it, expect } from "vitest";

import {
  PolicyChangeStepUpAuthorizationSigner,
  PolicyChangeStepUpAuthorizationVerifier,
} from "../../src/index.js";

import type { PolicyChangeStepUpAuthorization } from "@parmana/shared";

function generateKeyPair() {
  return generateKeyPairSync("ed25519");
}

describe("PolicyChangeStepUpAuthorization sign/verify", () => {
  it("signs and verifies a round-tripped envelope", async () => {
    const { privateKey, publicKey } = generateKeyPair();

    const signer = new PolicyChangeStepUpAuthorizationSigner();
    const verifier = new PolicyChangeStepUpAuthorizationVerifier();

    const signed = await signer.sign(
      { pendingPolicyChangeId: "ppc-1", action: "approve" },
      privateKey,
      "checker-key-1",
      60,
    );

    const transported = JSON.parse(
      JSON.stringify(signed),
    ) as PolicyChangeStepUpAuthorization;

    const result = await verifier.verify(transported, publicKey, {
      pendingPolicyChangeId: "ppc-1",
      action: "approve",
    });

    expect(result.valid).toBe(true);
    expect(result.checks.signatureVerified).toBe(true);
    expect(result.checks.notExpired).toBe(true);
    expect(result.checks.pendingPolicyChangeIdMatches).toBe(true);
    expect(result.checks.actionMatches).toBe(true);
  });

  it("always signs with algorithm 'ed25519', independent of any server config", async () => {
    const { privateKey } = generateKeyPair();
    const signer = new PolicyChangeStepUpAuthorizationSigner();

    const signed = await signer.sign(
      { pendingPolicyChangeId: "ppc-1", action: "approve" },
      privateKey,
      "checker-key-1",
      60,
    );

    expect(signed.algorithm).toBe("ed25519");
  });

  it("rejects a signature from a different keypair", async () => {
    const { privateKey } = generateKeyPair();
    const impostor = generateKeyPair();

    const signer = new PolicyChangeStepUpAuthorizationSigner();
    const verifier = new PolicyChangeStepUpAuthorizationVerifier();

    const signed = await signer.sign(
      { pendingPolicyChangeId: "ppc-1", action: "approve" },
      privateKey,
      "checker-key-1",
      60,
    );

    const result = await verifier.verify(signed, impostor.publicKey, {
      pendingPolicyChangeId: "ppc-1",
      action: "approve",
    });

    expect(result.valid).toBe(false);
    expect(result.checks.signatureVerified).toBe(false);
  });

  it("rejects a tampered payload field even with a genuinely valid signature elsewhere on the envelope", async () => {
    const { privateKey, publicKey } = generateKeyPair();

    const signer = new PolicyChangeStepUpAuthorizationSigner();
    const verifier = new PolicyChangeStepUpAuthorizationVerifier();

    const signed = await signer.sign(
      { pendingPolicyChangeId: "ppc-1", action: "approve" },
      privateKey,
      "checker-key-1",
      60,
    );

    const tampered: PolicyChangeStepUpAuthorization = {
      ...signed,
      payload: {
        ...signed.payload,
        pendingPolicyChangeId: "ppc-attacker-controlled",
      },
    };

    const result = await verifier.verify(tampered, publicKey, {
      pendingPolicyChangeId: "ppc-attacker-controlled",
      action: "approve",
    });

    expect(result.valid).toBe(false);
    expect(result.checks.signatureVerified).toBe(false);
  });

  it("rejects an expired envelope", async () => {
    const { privateKey, publicKey } = generateKeyPair();

    const signer = new PolicyChangeStepUpAuthorizationSigner();
    const verifier = new PolicyChangeStepUpAuthorizationVerifier();

    const signed = await signer.sign(
      { pendingPolicyChangeId: "ppc-1", action: "approve" },
      privateKey,
      "checker-key-1",
      60,
    );

    const future = new Date(Date.parse(signed.payload.expiresAt) + 1_000);

    const result = await verifier.verify(
      signed,
      publicKey,
      { pendingPolicyChangeId: "ppc-1", action: "approve" },
      future,
    );

    expect(result.valid).toBe(false);
    expect(result.checks.notExpired).toBe(false);
  });

  it("rejects an envelope presented for a different pendingPolicyChangeId", async () => {
    const { privateKey, publicKey } = generateKeyPair();

    const signer = new PolicyChangeStepUpAuthorizationSigner();
    const verifier = new PolicyChangeStepUpAuthorizationVerifier();

    const signed = await signer.sign(
      { pendingPolicyChangeId: "ppc-1", action: "approve" },
      privateKey,
      "checker-key-1",
      60,
    );

    const result = await verifier.verify(signed, publicKey, {
      pendingPolicyChangeId: "ppc-2",
      action: "approve",
    });

    expect(result.valid).toBe(false);
    expect(result.checks.pendingPolicyChangeIdMatches).toBe(false);
  });

  it("rejects an envelope presented for a different action", async () => {
    const { privateKey, publicKey } = generateKeyPair();

    const signer = new PolicyChangeStepUpAuthorizationSigner();
    const verifier = new PolicyChangeStepUpAuthorizationVerifier();

    const signed = await signer.sign(
      { pendingPolicyChangeId: "ppc-1", action: "reject" },
      privateKey,
      "checker-key-1",
      60,
    );

    const result = await verifier.verify(signed, publicKey, {
      pendingPolicyChangeId: "ppc-1",
      action: "approve",
    });

    expect(result.valid).toBe(false);
    expect(result.checks.actionMatches).toBe(false);
  });

  it("rejects an unsupported payload version before attempting signature verification", async () => {
    const { privateKey, publicKey } = generateKeyPair();

    const signer = new PolicyChangeStepUpAuthorizationSigner();
    const verifier = new PolicyChangeStepUpAuthorizationVerifier();

    const signed = await signer.sign(
      { pendingPolicyChangeId: "ppc-1", action: "approve" },
      privateKey,
      "checker-key-1",
      60,
    );

    const wrongVersion = {
      ...signed,
      payload: { ...signed.payload, version: 2 as unknown as 1 },
    };

    const result = await verifier.verify(wrongVersion, publicKey, {
      pendingPolicyChangeId: "ppc-1",
      action: "approve",
    });

    expect(result.valid).toBe(false);
    expect(result.checks.versionSupported).toBe(false);
    expect(result.checks.signatureVerified).toBe(false);
  });

  it("rejects an invalid TTL at sign time", async () => {
    const { privateKey } = generateKeyPair();
    const signer = new PolicyChangeStepUpAuthorizationSigner();

    await expect(
      signer.sign(
        { pendingPolicyChangeId: "ppc-1", action: "approve" },
        privateKey,
        "checker-key-1",
        0,
      ),
    ).rejects.toThrow("Invalid step-up authorization TTL");
  });
});
