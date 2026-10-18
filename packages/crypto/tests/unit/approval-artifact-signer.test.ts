import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
  ApprovalArtifactSigner,
} from "../../src/ApprovalArtifactCrypto.js";
import { SignatureVerifier } from "../../src/SignatureVerifier.js";

describe("ApprovalArtifactSigner", () => {
  const input = {
    approverId: "manager-priya",
    keyId: "manager-priya-key-1",
    capability: "paytm:refund",
    resourceId: "order-1",
    scope: { field: "amount", comparator: "lte" as const, value: 75_000 },
    ttlSeconds: 900,
  };

  it("produces a version 1 approval for exactly what was approved, with a fresh id and nonce and the requested expiry", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const now = new Date("2026-09-27T10:00:00.000Z");

    const approval = await new ApprovalArtifactSigner().sign(
      input,
      privateKey,
      now,
    );
    const second = await new ApprovalArtifactSigner().sign(
      input,
      privateKey,
      now,
    );

    expect(approval.payload).toMatchObject({
      version: 1,
      issuer: { approverId: "manager-priya", keyId: "manager-priya-key-1" },
      capability: "paytm:refund",
      resourceId: "order-1",
      scope: input.scope,
      issuedAt: "2026-09-27T10:00:00.000Z",
      expiresAt: "2026-09-27T10:15:00.000Z",
    });
    expect(approval.signature.algorithm).toBe("ed25519");
    expect(approval.signature.keyId).toBe("manager-priya-key-1");
    expect(second.payload.nonce).not.toBe(approval.payload.nonce);
    expect(second.payload.approvalId).not.toBe(approval.payload.approvalId);
  });

  it("signs the payload so that only the approver's public key verifies it, and a changed payload fails", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const other = generateKeyPairSync("ed25519");
    const verifier = new SignatureVerifier(APPROVAL_ARTIFACT_CRYPTO_PROVIDER);

    const approval = await new ApprovalArtifactSigner().sign(input, privateKey);

    expect(
      await verifier.verify(
        approval.payload,
        approval.signature.value,
        publicKey,
      ),
    ).toBe(true);
    expect(
      await verifier.verify(
        approval.payload,
        approval.signature.value,
        other.publicKey,
      ),
    ).toBe(false);
    expect(
      await verifier.verify(
        {
          ...approval.payload,
          scope: { ...input.scope, value: 750_000 },
        },
        approval.signature.value,
        publicKey,
      ),
    ).toBe(false);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a TTL of %s",
    async (ttlSeconds) => {
      const { privateKey } = generateKeyPairSync("ed25519");

      await expect(
        new ApprovalArtifactSigner().sign({ ...input, ttlSeconds }, privateKey),
      ).rejects.toThrow("Invalid approval TTL");
    },
  );
});
