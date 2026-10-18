import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";

import { describe, expect, it } from "vitest";

import { canonicalSerialize, signApproval } from "../src/index.js";

function approverKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: String(privateKey.export({ type: "pkcs8", format: "pem" })),
    publicKey,
  };
}

describe("signApproval", () => {
  it("signs the canonical payload with the approver key, scoped to an amount", () => {
    const { privateKeyPem, publicKey } = approverKey();

    const approval = signApproval({
      privateKeyPem,
      approverId: "manager-priya",
      keyId: "manager-priya-key-1",
      capability: "paytm:refund",
      resourceId: "ORD-1042",
      maxAmount: 75000,
    });

    expect(approval.payload).toMatchObject({
      version: 1,
      issuer: { approverId: "manager-priya", keyId: "manager-priya-key-1" },
      capability: "paytm:refund",
      resourceId: "ORD-1042",
      scope: { field: "value", comparator: "lte", value: 75000 },
    });
    expect(approval.signature).toMatchObject({
      algorithm: "ed25519",
      keyId: "manager-priya-key-1",
    });
    expect(
      Date.parse(approval.payload.expiresAt) -
        Date.parse(approval.payload.issuedAt),
    ).toBe(900_000);
    expect(
      verify(
        null,
        canonicalSerialize(approval.payload),
        createPublicKey(publicKey.export({ type: "spki", format: "pem" })),
        Buffer.from(approval.signature.value, "base64"),
      ),
    ).toBe(true);
  });

  it("names exactly the resource when no amount is given", () => {
    const approval = signApproval({
      privateKeyPem: approverKey().privateKeyPem,
      approverId: "a",
      keyId: "k",
      capability: "github:pr-merge",
      resourceId: "acme/api#42",
      ttlSeconds: 60,
    });

    expect(approval.payload.scope).toEqual({
      field: "resourceId",
      comparator: "eq",
      value: "acme/api#42",
    });
  });

  it("gives every approval its own id and nonce", () => {
    const input = {
      privateKeyPem: approverKey().privateKeyPem,
      approverId: "a",
      keyId: "k",
      capability: "paytm:refund",
      resourceId: "ORD-1",
      maxAmount: 10,
    };
    const first = signApproval(input);
    const second = signApproval(input);

    expect(first.payload.approvalId).not.toBe(second.payload.approvalId);
    expect(first.payload.nonce).not.toBe(second.payload.nonce);
  });

  it("refuses bad input", () => {
    const base = {
      privateKeyPem: approverKey().privateKeyPem,
      approverId: "a",
      keyId: "k",
      capability: "paytm:refund",
      resourceId: "ORD-1",
    };

    expect(() => signApproval({ ...base, ttlSeconds: 0 })).toThrow(
      /ttlSeconds/,
    );
    expect(() => signApproval({ ...base, ttlSeconds: 86_401 })).toThrow(
      /ttlSeconds/,
    );
    expect(() => signApproval({ ...base, capability: "refund" })).toThrow(
      /capability/,
    );
    expect(() => signApproval({ ...base, resourceId: "" })).toThrow(
      /resourceId/,
    );
    expect(() => signApproval({ ...base, maxAmount: -1 })).toThrow(/maxAmount/);

    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    expect(() =>
      signApproval({
        ...base,
        privateKeyPem: String(
          privateKey.export({ type: "pkcs8", format: "pem" }),
        ),
      }),
    ).toThrow(/Ed25519/);
  });
});
