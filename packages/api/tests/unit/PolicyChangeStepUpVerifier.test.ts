import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { PolicyChangeStepUpAuthorizationSigner } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";

import { PolicyChangeStepUpVerifier } from "../../src/auth/PolicyChangeStepUpVerifier.js";

const signer = new PolicyChangeStepUpAuthorizationSigner();

describe("PolicyChangeStepUpVerifier", () => {
  it("rejects an envelope whose TTL exceeds server policy, even with a genuinely valid signature", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");

    const verifier = new PolicyChangeStepUpVerifier({
      nonceStore: new MemoryNonceStore(),
      maxTtlSeconds: 60,
    });

    const signed = await signer.sign(
      { pendingPolicyChangeId: "ppc-1", action: "approve" },
      privateKey,
      "checker-key-1",
      3600,
    );

    const result = await verifier.verify(signed, publicKey, {
      pendingPolicyChangeId: "ppc-1",
      action: "approve",
    });

    expect(result.valid).toBe(false);
    expect(result.checks.ttlWithinPolicy).toBe(false);
    // Signature itself is genuinely valid -- only TTL policy fails.
    expect(result.checks.signatureVerified).toBe(true);
  });

  it("does not consume the nonce when a non-nonce check fails, so a corrected retry is not itself blocked", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const nonceStore = new MemoryNonceStore();

    const verifier = new PolicyChangeStepUpVerifier({ nonceStore });

    const signed = await signer.sign(
      { pendingPolicyChangeId: "ppc-1", action: "approve" },
      privateKey,
      "checker-key-1",
      60,
    );

    // Wrong action -> fails before nonce consumption.
    const failed = await verifier.verify(signed, publicKey, {
      pendingPolicyChangeId: "ppc-1",
      action: "reject",
    });

    expect(failed.valid).toBe(false);
    expect(failed.checks.nonceUnseen).toBe(false);

    // The SAME envelope, verified correctly this time, still succeeds --
    // proof its nonce was never burned by the failing attempt above.
    const succeeded = await verifier.verify(signed, publicKey, {
      pendingPolicyChangeId: "ppc-1",
      action: "approve",
    });

    expect(succeeded.valid).toBe(true);
    expect(succeeded.checks.nonceUnseen).toBe(true);
  });

  it("rejects a second verification of the same valid envelope (replay)", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const nonceStore = new MemoryNonceStore();

    const verifier = new PolicyChangeStepUpVerifier({ nonceStore });

    const signed = await signer.sign(
      { pendingPolicyChangeId: "ppc-1", action: "approve" },
      privateKey,
      "checker-key-1",
      60,
    );

    const first = await verifier.verify(signed, publicKey, {
      pendingPolicyChangeId: "ppc-1",
      action: "approve",
    });

    expect(first.valid).toBe(true);

    const second = await verifier.verify(signed, publicKey, {
      pendingPolicyChangeId: "ppc-1",
      action: "approve",
    });

    expect(second.valid).toBe(false);
    expect(second.checks.nonceUnseen).toBe(false);
  });

  it("defaults maxTtlSeconds to 120", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");

    const verifier = new PolicyChangeStepUpVerifier({
      nonceStore: new MemoryNonceStore(),
    });

    const withinDefault = await signer.sign(
      { pendingPolicyChangeId: "ppc-1", action: "approve" },
      privateKey,
      "checker-key-1",
      120,
    );

    const result = await verifier.verify(withinDefault, publicKey, {
      pendingPolicyChangeId: "ppc-1",
      action: "approve",
    });

    expect(result.checks.ttlWithinPolicy).toBe(true);
  });
});
