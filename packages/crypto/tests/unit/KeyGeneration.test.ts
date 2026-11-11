import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  AuthorityType,
  approverKeyFileStem,
  generateApproverKeyPair,
  generateCallerKey,
} from "../../src/index.js";

describe("generateCallerKey", () => {
  it("stores the SHA-256 of the raw key, never the raw key", () => {
    const { rawKey, entry } = generateCallerKey({ callerId: "pavancharak" });

    expect(entry.keyHash).toBe(
      createHash("sha256").update(rawKey, "utf8").digest("hex"),
    );
    expect(JSON.stringify(entry)).not.toContain(rawKey);
  });

  it("requires USER for a step-up key", () => {
    expect(() =>
      generateCallerKey({ callerId: "x", generateStepUpKey: true }),
    ).toThrow(/requires --credential-holder-type USER/);
  });

  it("creates a step-up key pair only when asked", () => {
    const withKey = generateCallerKey({
      callerId: "checker",
      credentialHolderType: AuthorityType.USER,
      generateStepUpKey: true,
    });
    const without = generateCallerKey({ callerId: "plain" });

    expect(withKey.stepUpPrivateKey).toContain("BEGIN PRIVATE KEY");
    expect(withKey.entry.stepUpPublicKey).toContain("BEGIN PUBLIC KEY");
    expect(without.stepUpPrivateKey).toBeUndefined();
    expect(without.entry.stepUpPublicKey).toBeUndefined();
  });
});

describe("approver key helpers", () => {
  it("generates an Ed25519 pair in PEM form", () => {
    const pair = generateApproverKeyPair();

    expect(pair.privateKeyPem).toContain("BEGIN PRIVATE KEY");
    expect(pair.publicKeyPem).toContain("BEGIN PUBLIC KEY");
  });

  it("names the file stem from the approver and key IDs, and rejects unsafe IDs", () => {
    expect(approverKeyFileStem("mamta-checker", "mamta-checker-key-1")).toBe(
      "mamta-checker__mamta-checker-key-1",
    );
    expect(() => approverKeyFileStem("a/b", "k1")).toThrow(/must use only/);
  });
});
