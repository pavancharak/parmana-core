import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { StaticApprovalIssuerRegistry } from "../../src/ApprovalIssuerRegistry.js";

describe("StaticApprovalIssuerRegistry", () => {
  it("does not confuse ids that only differ in where a colon falls", () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const registry = new StaticApprovalIssuerRegistry([
      {
        approverId: "manager:alice",
        keyId: "key-1",
        publicKey,
        revoked: false,
      },
    ]);

    expect(registry.resolve("manager:alice", "key-1")).toBeDefined();
    expect(registry.resolve("manager", "alice:key-1")).toBeUndefined();
  });
});
