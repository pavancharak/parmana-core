import { describe, expect, it } from "vitest";

import { AuthorityType } from "@parmana/shared";

import { hashApiKey } from "../../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../../src/auth/StaticKeyAuthenticator.js";

describe("hashApiKey", () => {
  it("is deterministic", () => {
    expect(hashApiKey("some-key")).toBe(hashApiKey("some-key"));
  });

  it("produces a 64-character lowercase hex digest", () => {
    expect(hashApiKey("some-key")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different keys hash to different digests", () => {
    expect(hashApiKey("key-a")).not.toBe(hashApiKey("key-b"));
  });
});

describe("StaticKeyAuthenticator", () => {
  it("authenticates a caller whose key matches a configured hash", () => {
    const rawKey = "correct-horse-battery-staple";

    const authenticator = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey(rawKey) },
    ]);

    expect(authenticator.authenticate(rawKey)).toEqual({
      callerId: "orchestrator-1",
    });
  });

  it("rejects an unrecognized key", () => {
    const authenticator = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey("the-real-key") },
    ]);

    expect(
      authenticator.authenticate("a-completely-different-key"),
    ).toBeUndefined();
  });

  it("rejects an undefined credential", () => {
    const authenticator = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey("the-real-key") },
    ]);

    expect(authenticator.authenticate(undefined)).toBeUndefined();
  });

  it("rejects an empty-string credential", () => {
    const authenticator = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey("the-real-key") },
    ]);

    expect(authenticator.authenticate("")).toBeUndefined();
  });

  it("distinguishes between two different callers' keys", () => {
    const authenticator = new StaticKeyAuthenticator([
      { callerId: "caller-a", keyHash: hashApiKey("key-a") },
      { callerId: "caller-b", keyHash: hashApiKey("key-b") },
    ]);

    expect(authenticator.authenticate("key-a")).toEqual({
      callerId: "caller-a",
    });
    expect(authenticator.authenticate("key-b")).toEqual({
      callerId: "caller-b",
    });
  });

  it("a key valid for one caller does not authenticate as a different caller", () => {
    const authenticator = new StaticKeyAuthenticator([
      { callerId: "caller-a", keyHash: hashApiKey("key-a") },
      { callerId: "caller-b", keyHash: hashApiKey("key-b") },
    ]);

    const result = authenticator.authenticate("key-a");

    expect(result?.callerId).toBe("caller-a");
    expect(result?.callerId).not.toBe("caller-b");
  });

  it("supports multiple active keys for the same caller (rotation, both valid)", () => {
    const authenticator = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey("old-key") },
      { callerId: "orchestrator-1", keyHash: hashApiKey("new-key") },
    ]);

    expect(authenticator.authenticate("old-key")).toEqual({
      callerId: "orchestrator-1",
    });
    expect(authenticator.authenticate("new-key")).toEqual({
      callerId: "orchestrator-1",
    });
  });

  it("a revoked key stops authenticating once its entry is removed", () => {
    const oldKey = "old-key";
    const newKey = "new-key";

    const beforeRevocation = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey(oldKey) },
      { callerId: "orchestrator-1", keyHash: hashApiKey(newKey) },
    ]);

    expect(beforeRevocation.authenticate(oldKey)).toEqual({
      callerId: "orchestrator-1",
    });

    // Rotation completes: the old entry is removed from config, the new
    // one remains. This models "add-new, migrate, revoke-old" with no
    // downtime — the authenticator is just reconstructed from the new
    // config, exactly like a real config reload would do.
    const afterRevocation = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey(newKey) },
    ]);

    expect(afterRevocation.authenticate(oldKey)).toBeUndefined();
    expect(afterRevocation.authenticate(newKey)).toEqual({
      callerId: "orchestrator-1",
    });
  });

  it("propagates allowedCapabilities onto the returned identity when configured", () => {
    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "orchestrator-1",
        keyHash: hashApiKey("the-real-key"),
        allowedCapabilities: ["razorpay:refund-create"],
      },
    ]);

    expect(authenticator.authenticate("the-real-key")).toEqual({
      callerId: "orchestrator-1",
      allowedCapabilities: ["razorpay:refund-create"],
    });
  });

  it("omits allowedCapabilities from the returned identity when not configured", () => {
    const authenticator = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey("the-real-key") },
    ]);

    expect(
      authenticator.authenticate("the-real-key")?.allowedCapabilities,
    ).toBeUndefined();
  });

  it("propagates credentialHolderType onto the returned identity when configured", () => {
    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "orchestrator-1",
        keyHash: hashApiKey("the-real-key"),
        credentialHolderType: AuthorityType.USER,
      },
    ]);

    expect(authenticator.authenticate("the-real-key")).toEqual({
      callerId: "orchestrator-1",
      credentialHolderType: AuthorityType.USER,
    });
  });

  it("omits credentialHolderType from the returned identity when not configured", () => {
    const authenticator = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey("the-real-key") },
    ]);

    expect(
      authenticator.authenticate("the-real-key")?.credentialHolderType,
    ).toBeUndefined();
  });
});
