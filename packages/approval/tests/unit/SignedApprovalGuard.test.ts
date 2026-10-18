import { describe, expect, it } from "vitest";

import { isSignedApprovalShape } from "../../src/SignedApprovalGuard.js";

/**
 * Phase 3C, Task 5-6 (security/adversarial coverage): a caller-
 * supplied signals.approvalArtifact is untyped JSON from the wire,
 * not a real SignedApproval instance. isSignedApprovalShape is the
 * only thing standing between arbitrary/malformed/hostile JSON and
 * ApprovalVerifier.verify() -- it must reject every malformed shape,
 * never throw, and never be tricked by a partially-correct object.
 */
function validArtifact(): unknown {
  return {
    payload: {
      version: 1,
      approvalId: "approval-1",
      issuer: { approverId: "manager-jane", keyId: "manager-jane-key-1" },
      issuedAt: "2026-08-05T12:00:00.000Z",
      expiresAt: "2026-08-05T13:00:00.000Z",
      capability: "hubspot:deal-update",
      resourceId: "9005",
      scope: { field: "amountDeltaAbs", comparator: "lte", value: 50_000 },
      nonce: "nonce-1",
    },
    signature: {
      algorithm: "ed25519",
      keyId: "manager-jane-key-1",
      value: "base64signature",
      signedAt: "2026-08-05T12:00:00.000Z",
    },
  };
}

describe("isSignedApprovalShape", () => {
  it("accepts a well-formed artifact", () => {
    expect(isSignedApprovalShape(validArtifact())).toBe(true);
  });

  it("accepts a well-formed 'between' scope", () => {
    const artifact = validArtifact() as { payload: { scope: unknown } };
    artifact.payload.scope = {
      field: "amountDeltaAbs",
      comparator: "between",
      value: { min: 1, max: 2 },
    };
    expect(isSignedApprovalShape(artifact)).toBe(true);
  });

  for (const primitive of [null, undefined, "a string", 42, true]) {
    it(`rejects a non-object top-level value (${JSON.stringify(primitive)})`, () => {
      expect(isSignedApprovalShape(primitive)).toBe(false);
    });
  }

  it("rejects an empty object", () => {
    expect(isSignedApprovalShape({})).toBe(false);
  });

  it("rejects a missing payload", () => {
    const artifact = validArtifact() as Record<string, unknown>;
    delete artifact.payload;
    expect(isSignedApprovalShape(artifact)).toBe(false);
  });

  it("rejects a missing signature", () => {
    const artifact = validArtifact() as Record<string, unknown>;
    delete artifact.signature;
    expect(isSignedApprovalShape(artifact)).toBe(false);
  });

  it("rejects an unsupported version (string '1' instead of number 1)", () => {
    const artifact = validArtifact() as { payload: Record<string, unknown> };
    artifact.payload.version = "1";
    expect(isSignedApprovalShape(artifact)).toBe(false);
  });

  it("rejects a missing issuer", () => {
    const artifact = validArtifact() as { payload: Record<string, unknown> };
    delete artifact.payload.issuer;
    expect(isSignedApprovalShape(artifact)).toBe(false);
  });

  it("rejects an issuer missing keyId", () => {
    const artifact = validArtifact() as {
      payload: { issuer: Record<string, unknown> };
    };
    delete artifact.payload.issuer.keyId;
    expect(isSignedApprovalShape(artifact)).toBe(false);
  });

  it("rejects a scope with a non-numeric 'between' bound", () => {
    const artifact = validArtifact() as { payload: Record<string, unknown> };
    artifact.payload.scope = {
      field: "amountDeltaAbs",
      comparator: "between",
      value: { min: "1", max: 2 },
    };
    expect(isSignedApprovalShape(artifact)).toBe(false);
  });

  it("rejects a scope whose value is neither primitive nor a min/max object", () => {
    const artifact = validArtifact() as { payload: Record<string, unknown> };
    artifact.payload.scope = {
      field: "amountDeltaAbs",
      comparator: "eq",
      value: [1, 2],
    };
    expect(isSignedApprovalShape(artifact)).toBe(false);
  });

  it("rejects a signature whose value is not a string", () => {
    const artifact = validArtifact() as { signature: Record<string, unknown> };
    artifact.signature.value = 12345;
    expect(isSignedApprovalShape(artifact)).toBe(false);
  });

  it("rejects nonce, resourceId, or capability that are not strings", () => {
    for (const field of ["nonce", "resourceId", "capability"] as const) {
      const artifact = validArtifact() as { payload: Record<string, unknown> };
      artifact.payload[field] = 123;
      expect(isSignedApprovalShape(artifact)).toBe(false);
    }
  });

  it("does not throw on deeply hostile/malformed input, only returns false", () => {
    const hostile = JSON.parse(
      '{"__proto__": {"x": 1}, "payload": null, "signature": null}',
    );
    expect(() => isSignedApprovalShape(hostile)).not.toThrow();
    expect(isSignedApprovalShape(hostile)).toBe(false);
  });

  // Found by mutation testing: each field's check could be dropped without
  // a test failing, because only some fields were tried, and null was
  // never tried where an object is required. Every field ApprovalVerifier
  // reads is set, one at a time, to a value of the wrong kind.
  it.each([
    ["payload", null],
    ["signature", null],
    ["payload.issuer", null],
    ["payload.scope", null],
    ["payload.scope", "lte 50000"],
    ["payload.scope.field", 7],
    ["payload.scope.comparator", 7],
    ["payload.scope.value", null],
    ["payload.scope.value", true],
    ["payload.scope.value", { min: 1 }],
    ["payload.scope.value", { max: 2 }],
    ["payload.approvalId", 1],
    ["payload.issuedAt", 1],
    ["payload.expiresAt", 1],
    ["payload.issuer.approverId", 1],
    ["signature.algorithm", 1],
    ["signature.keyId", 1],
  ])("rejects %s set to %j", (path, wrongValue) => {
    const artifact = validArtifact() as Record<string, unknown>;
    const keys = path.split(".");
    const parent = keys
      .slice(0, -1)
      .reduce<Record<string, unknown>>(
        (object, key) => object[key] as Record<string, unknown>,
        artifact,
      );
    parent[keys[keys.length - 1]!] = wrongValue;
    expect(isSignedApprovalShape(artifact)).toBe(false);
  });

  it("accepts a scope whose bound is a string", () => {
    const artifact = validArtifact() as { payload: { scope: unknown } };
    artifact.payload.scope = {
      field: "orderId",
      comparator: "eq",
      value: "order-1",
    };
    expect(isSignedApprovalShape(artifact)).toBe(true);
  });
});
