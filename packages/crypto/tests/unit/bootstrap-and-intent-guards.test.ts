import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CryptoError } from "../../src/errors/CryptoError.js";
import { ExecutionIntentCrypto } from "../../src/ExecutionIntentCrypto.js";

import type { ExecutionIntent } from "@parmana/shared";

/**
 * CryptoBootstrap and KeyBootstrap cache their results in private static
 * fields, so each test that depends on a fresh configuration imports a new
 * module instance (the pattern key-bootstrap.test.ts uses).
 */
async function freshModule<T>(path: string, name: string): Promise<T> {
  vi.resetModules();
  const module = (await import(path)) as Record<string, T>;
  return module[name] as T;
}

const ORIGINAL_PRIMARY = process.env.PRIMARY_SIGNATURE_PROVIDER;
const ORIGINAL_SECONDARY = process.env.SECONDARY_SIGNATURE_PROVIDER;
const ORIGINAL_KEY_PROVIDER = process.env.KEY_PROVIDER;

describe("CryptoBootstrap caching and hybrid refusal", () => {
  beforeEach(() => {
    process.env.PRIMARY_SIGNATURE_PROVIDER = "ed25519";
    delete process.env.SECONDARY_SIGNATURE_PROVIDER;
  });

  afterEach(() => {
    restore("PRIMARY_SIGNATURE_PROVIDER", ORIGINAL_PRIMARY);
    restore("SECONDARY_SIGNATURE_PROVIDER", ORIGINAL_SECONDARY);
  });

  it("returns the same provider on every call to create()", async () => {
    const CryptoBootstrap = await freshModule<
      typeof import("../../src/CryptoBootstrap.js").CryptoBootstrap
    >("../../src/CryptoBootstrap.js", "CryptoBootstrap");

    const first = CryptoBootstrap.create();
    const second = CryptoBootstrap.create();

    expect(second).toBe(first);
  });

  it("refuses createHybrid() when no secondary signature provider is configured", async () => {
    const CryptoBootstrap = await freshModule<
      typeof import("../../src/CryptoBootstrap.js").CryptoBootstrap
    >("../../src/CryptoBootstrap.js", "CryptoBootstrap");

    expect(() => CryptoBootstrap.createHybrid()).toThrow(
      "Secondary signature provider is not configured.",
    );
  });
});

describe("KeyBootstrap caching", () => {
  afterEach(() => {
    restore("KEY_PROVIDER", ORIGINAL_KEY_PROVIDER);
  });

  it("returns the same key provider on every call to create()", async () => {
    delete process.env.KEY_PROVIDER;

    const KeyBootstrap = await freshModule<
      typeof import("../../src/KeyBootstrap.js").KeyBootstrap
    >("../../src/KeyBootstrap.js", "KeyBootstrap");

    const first = KeyBootstrap.create();
    const second = KeyBootstrap.create();

    expect(second).toBe(first);
  });
});

describe("ExecutionIntentCrypto.verify: hash check", () => {
  function draft(): Omit<ExecutionIntent, "intentHash" | "signature"> {
    return {
      intentId: "intent-1",
      businessTransactionId: "tx-1",
      decisionId: "decision-1",
      authorizationId: "authorization-1",
      policyName: "customer-refund",
      policyVersion: "1.0.0",
      policyContentHash: "policy-hash",
      signalsHash: "signals-hash",
      businessTransactionHash: "content-hash",
      action: "paytm:refund",
      target: "paytm://orders/1",
      submittedBy: "caller-1",
      createdAt: new Date("2026-09-21T00:00:00.000Z"),
    };
  }

  async function signedIntent(
    crypto: ExecutionIntentCrypto,
  ): Promise<ExecutionIntent> {
    const unsigned = {
      ...draft(),
      intentHash: "",
      signature: {
        algorithm: "ed25519" as const,
        keyId: "default",
        value: "",
        signedAt: draft().createdAt,
      },
    } as ExecutionIntent;

    const signature = await crypto.sign(unsigned);
    const intentHash = await crypto.hash(unsigned);

    return { ...unsigned, intentHash, signature };
  }

  it("verifies a genuine signed intent", async () => {
    const crypto = new ExecutionIntentCrypto();

    expect(await crypto.verify(await signedIntent(crypto))).toBe(true);
  });

  it("refuses an intent whose intentHash does not match its content", async () => {
    const crypto = new ExecutionIntentCrypto();
    const intent = await signedIntent(crypto);

    expect(await crypto.verify({ ...intent, intentHash: "0".repeat(64) })).toBe(
      false,
    );
  });

  it("refuses an intent whose action was changed after signing", async () => {
    const crypto = new ExecutionIntentCrypto();
    const intent = await signedIntent(crypto);

    expect(await crypto.verify({ ...intent, action: "paytm:other" })).toBe(
      false,
    );
  });
});

describe("CryptoError", () => {
  it("names itself CryptoError and keeps its message", () => {
    const error = new CryptoError("boom");

    expect(error.name).toBe("CryptoError");
    expect(error.message).toBe("boom");
  });

  it("is an Error and an instance of CryptoError, including for subclasses", () => {
    class SubError extends CryptoError {}

    expect(new CryptoError("x")).toBeInstanceOf(Error);
    expect(new CryptoError("x")).toBeInstanceOf(CryptoError);
    expect(new SubError("x")).toBeInstanceOf(CryptoError);
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
