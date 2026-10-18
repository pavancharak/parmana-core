import { describe, expect, it } from "vitest";

import {
  InMemoryCredentialVault,
  InMemorySessionCredentialVault,
  type Clock,
  type CredentialVault,
  type ExecutionCredential,
  type IdGenerator,
} from "../../src/index.js";

class CountingCredentialVault implements CredentialVault {
  resolveCount = 0;

  constructor(private readonly inner: InMemoryCredentialVault) {}

  async getCredential(connectorId: string): Promise<ExecutionCredential> {
    this.resolveCount += 1;
    return this.inner.getCredential(connectorId);
  }
}

class ManualClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  advanceTo(date: Date): void {
    this.current = date;
  }
}

class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `session-credential-${this.counter}`;
  }
}

function fixture(lifetimeMs = 30_000) {
  const credentials = new InMemoryCredentialVault();
  credentials.setCredential("sap", {
    value: Object.freeze({ apiKey: "sap-secret" }),
  });

  const clock = new ManualClock(new Date("2026-01-01T00:00:00Z"));
  const idGenerator = new SequentialIdGenerator();

  const vault = new InMemorySessionCredentialVault({
    credentials,
    clock,
    idGenerator,
    lifetimeMs,
  });

  return { vault, clock, idGenerator };
}

describe("InMemorySessionCredentialVault", () => {
  it("issues a session credential and consumes it exactly once", async () => {
    const { vault } = fixture();

    const session = await vault.issue("sap", "authorization-1");

    expect(session.sessionCredentialId).toBe("session-credential-1");
    expect(session.connectorId).toBe("sap");
    expect(session.authorizationId).toBe("authorization-1");

    const credential = await vault.consume(session.sessionCredentialId);

    expect(credential.value).toEqual({ apiKey: "sap-secret" });
  });

  it("rejects reuse of an already-consumed session credential", async () => {
    const { vault } = fixture();

    const session = await vault.issue("sap", "authorization-1");
    await vault.consume(session.sessionCredentialId);

    await expect(vault.consume(session.sessionCredentialId)).rejects.toThrow(
      "already been used",
    );
  });

  it("rejects a session credential after it has expired", async () => {
    const { vault, clock } = fixture(1_000);

    const session = await vault.issue("sap", "authorization-1");
    clock.advanceTo(new Date("2026-01-01T00:00:01.001Z"));

    await expect(vault.consume(session.sessionCredentialId)).rejects.toThrow(
      "expired",
    );
  });

  it("rejects a session credential after it has been revoked", async () => {
    const { vault } = fixture();

    const session = await vault.issue("sap", "authorization-1");
    await vault.revoke(session.sessionCredentialId);

    await expect(vault.consume(session.sessionCredentialId)).rejects.toThrow(
      "revoked",
    );
  });

  it("rejects consume() for an unknown session credential ID (previously untested)", async () => {
    const { vault } = fixture();

    await expect(vault.consume("no-such-id")).rejects.toThrow(
      "Unknown session credential: no-such-id.",
    );
  });

  it("rejects revoke() for an unknown session credential ID (previously untested)", async () => {
    const { vault } = fixture();

    await expect(vault.revoke("no-such-id")).rejects.toThrow(
      "Unknown session credential: no-such-id.",
    );
  });

  it("treats the exact expiresAt instant as expired (boundary is inclusive via >=, previously untested)", async () => {
    const { vault, clock } = fixture(1_000);

    const session = await vault.issue("sap", "authorization-1");

    // issuedAt is 2026-01-01T00:00:00Z, lifetimeMs 1_000, so expiresAt is
    // exactly 2026-01-01T00:00:01.000Z. consume()'s comparison is
    // `now >= expiresAt`, so the exact instant must already be expired.
    clock.advanceTo(new Date("2026-01-01T00:00:01.000Z"));

    await expect(vault.consume(session.sessionCredentialId)).rejects.toThrow(
      "expired",
    );
  });

  it("does not treat one millisecond before expiresAt as expired", async () => {
    const { vault, clock } = fixture(1_000);

    const session = await vault.issue("sap", "authorization-1");

    clock.advanceTo(new Date("2026-01-01T00:00:00.999Z"));

    const credential = await vault.consume(session.sessionCredentialId);
    expect(credential.value).toEqual({ apiKey: "sap-secret" });
  });

  it("under two concurrent consume() calls on one session, exactly one succeeds (deterministic, not flaky)", async () => {
    // InMemorySessionCredentialVault.consume() marks `record.used = true`
    // synchronously, before its only internal await (the credential
    // resolution call) — Node's run-to-completion semantics mean two
    // consume() calls issued via Promise.all cannot interleave inside
    // that synchronous prefix, so this is deterministic, not a race that
    // only sometimes reproduces.
    const { vault } = fixture();

    const session = await vault.issue("sap", "authorization-1");

    const results = await Promise.allSettled([
      vault.consume(session.sessionCredentialId),
      vault.consume(session.sessionCredentialId),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toContain(
      "already been used",
    );
  });

  it("resolves the underlying secret only at consume(), never at issue()", async () => {
    const inner = new InMemoryCredentialVault();
    inner.setCredential("sap", {
      value: Object.freeze({ apiKey: "sap-secret" }),
    });
    const credentials = new CountingCredentialVault(inner);

    const vault = new InMemorySessionCredentialVault({
      credentials,
      clock: new ManualClock(new Date("2026-01-01T00:00:00Z")),
      idGenerator: new SequentialIdGenerator(),
      lifetimeMs: 30_000,
    });

    const session = await vault.issue("sap", "authorization-1");
    expect(credentials.resolveCount).toBe(1);

    await vault.consume(session.sessionCredentialId);
    expect(credentials.resolveCount).toBe(2);
  });
});
