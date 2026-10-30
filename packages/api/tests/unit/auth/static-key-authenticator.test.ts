import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthorityType } from "@parmana/shared";
import type { CallerKeyRevocationRepository } from "@parmana/shared";
import { MemoryCallerKeyRevocationRepository } from "@parmana/storage";

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("authenticates a caller whose key matches a configured hash", async () => {
    const rawKey = "correct-horse-battery-staple";

    const authenticator = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey(rawKey) },
    ]);

    await expect(authenticator.authenticate(rawKey)).resolves.toEqual({
      callerId: "orchestrator-1",
    });
  });

  it("rejects an unrecognized key", async () => {
    const authenticator = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey("the-real-key") },
    ]);

    await expect(
      authenticator.authenticate("a-completely-different-key"),
    ).resolves.toBeUndefined();
  });

  it("rejects an undefined credential", async () => {
    const authenticator = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey("the-real-key") },
    ]);

    await expect(
      authenticator.authenticate(undefined),
    ).resolves.toBeUndefined();
  });

  it("rejects an empty-string credential", async () => {
    const authenticator = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey("the-real-key") },
    ]);

    await expect(authenticator.authenticate("")).resolves.toBeUndefined();
  });

  it("distinguishes between two different callers' keys", async () => {
    const authenticator = new StaticKeyAuthenticator([
      { callerId: "caller-a", keyHash: hashApiKey("key-a") },
      { callerId: "caller-b", keyHash: hashApiKey("key-b") },
    ]);

    await expect(authenticator.authenticate("key-a")).resolves.toEqual({
      callerId: "caller-a",
    });
    await expect(authenticator.authenticate("key-b")).resolves.toEqual({
      callerId: "caller-b",
    });
  });

  it("a key valid for one caller does not authenticate as a different caller", async () => {
    const authenticator = new StaticKeyAuthenticator([
      { callerId: "caller-a", keyHash: hashApiKey("key-a") },
      { callerId: "caller-b", keyHash: hashApiKey("key-b") },
    ]);

    const result = await authenticator.authenticate("key-a");

    expect(result?.callerId).toBe("caller-a");
    expect(result?.callerId).not.toBe("caller-b");
  });

  it("supports multiple active keys for the same caller (rotation, both valid)", async () => {
    const authenticator = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey("old-key") },
      { callerId: "orchestrator-1", keyHash: hashApiKey("new-key") },
    ]);

    await expect(authenticator.authenticate("old-key")).resolves.toEqual({
      callerId: "orchestrator-1",
    });
    await expect(authenticator.authenticate("new-key")).resolves.toEqual({
      callerId: "orchestrator-1",
    });
  });

  it("a retired key stops authenticating once its entry is removed at restart", async () => {
    const oldKey = "old-key";
    const newKey = "new-key";

    const beforeRetirement = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey(oldKey) },
      { callerId: "orchestrator-1", keyHash: hashApiKey(newKey) },
    ]);

    await expect(beforeRetirement.authenticate(oldKey)).resolves.toEqual({
      callerId: "orchestrator-1",
    });

    // Retirement at restart: the old entry is removed from config, the new
    // one remains. The authenticator is rebuilt from the new config, as a
    // config reload would do. Use a revocation to refuse a key without a
    // restart (see the revocation tests below).
    const afterRetirement = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey(newKey) },
    ]);

    await expect(afterRetirement.authenticate(oldKey)).resolves.toBeUndefined();
    await expect(afterRetirement.authenticate(newKey)).resolves.toEqual({
      callerId: "orchestrator-1",
    });
  });

  it("propagates allowedCapabilities onto the returned identity when configured", async () => {
    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "orchestrator-1",
        keyHash: hashApiKey("the-real-key"),
        allowedCapabilities: ["razorpay:refund-create"],
      },
    ]);

    await expect(authenticator.authenticate("the-real-key")).resolves.toEqual({
      callerId: "orchestrator-1",
      allowedCapabilities: ["razorpay:refund-create"],
    });
  });

  it("omits allowedCapabilities from the returned identity when not configured", async () => {
    const authenticator = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey("the-real-key") },
    ]);

    const identity = await authenticator.authenticate("the-real-key");

    expect(identity?.allowedCapabilities).toBeUndefined();
  });

  it("propagates credentialHolderType onto the returned identity when configured", async () => {
    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "orchestrator-1",
        keyHash: hashApiKey("the-real-key"),
        credentialHolderType: AuthorityType.USER,
      },
    ]);

    await expect(authenticator.authenticate("the-real-key")).resolves.toEqual({
      callerId: "orchestrator-1",
      credentialHolderType: AuthorityType.USER,
    });
  });

  it("omits credentialHolderType from the returned identity when not configured", async () => {
    const authenticator = new StaticKeyAuthenticator([
      { callerId: "orchestrator-1", keyHash: hashApiKey("the-real-key") },
    ]);

    const identity = await authenticator.authenticate("the-real-key");

    expect(identity?.credentialHolderType).toBeUndefined();
  });

  describe("revocation", () => {
    it("refuses a configured key on the next request once it is revoked, with no restart", async () => {
      const revocations = new MemoryCallerKeyRevocationRepository();
      const authenticator = new StaticKeyAuthenticator(
        [{ callerId: "agent-1", keyHash: hashApiKey("agent-key") }],
        revocations,
      );

      await expect(authenticator.authenticate("agent-key")).resolves.toEqual({
        callerId: "agent-1",
      });

      await revocations.revoke({
        keyHash: hashApiKey("agent-key"),
        callerId: "agent-1",
        revokedBy: "operator-1",
        reason: "key exposed",
        revokedAt: new Date(),
      });

      await expect(
        authenticator.authenticate("agent-key"),
      ).resolves.toBeUndefined();
    });

    it("leaves other keys working when one key is revoked", async () => {
      const revocations = new MemoryCallerKeyRevocationRepository();
      const authenticator = new StaticKeyAuthenticator(
        [
          { callerId: "agent-1", keyHash: hashApiKey("key-1") },
          { callerId: "agent-2", keyHash: hashApiKey("key-2") },
        ],
        revocations,
      );

      await revocations.revoke({
        keyHash: hashApiKey("key-1"),
        callerId: "agent-1",
        revokedBy: "operator-1",
        reason: "rotated",
        revokedAt: new Date(),
      });

      await expect(
        authenticator.authenticate("key-1"),
      ).resolves.toBeUndefined();
      await expect(authenticator.authenticate("key-2")).resolves.toEqual({
        callerId: "agent-2",
      });
    });

    it("refuses the key when the revocation store fails, so a store outage never admits a revoked key", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const failingStore: CallerKeyRevocationRepository = {
        isRevoked: async () => {
          throw new Error("database unavailable");
        },
        revoke: async () => {},
      };

      const authenticator = new StaticKeyAuthenticator(
        [{ callerId: "agent-1", keyHash: hashApiKey("agent-key") }],
        failingStore,
      );

      await expect(
        authenticator.authenticate("agent-key"),
      ).resolves.toBeUndefined();
      expect(consoleError).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "caller_key_revocation_lookup_failed",
        }),
      );
    });

    it("a repeated revoke of the same key changes nothing", async () => {
      const revocations = new MemoryCallerKeyRevocationRepository();
      const revocation = {
        keyHash: hashApiKey("agent-key"),
        callerId: "agent-1",
        revokedBy: "operator-1",
        reason: "key exposed",
        revokedAt: new Date("2026-10-30T10:00:00Z"),
      };

      await revocations.revoke(revocation);
      await revocations.revoke({
        ...revocation,
        revokedBy: "operator-2",
        revokedAt: new Date("2026-10-30T11:00:00Z"),
      });

      await expect(revocations.isRevoked(revocation.keyHash)).resolves.toBe(
        true,
      );
    });
  });
});
