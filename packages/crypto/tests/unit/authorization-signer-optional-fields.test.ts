import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AuthorizationSigner,
  CryptoBootstrap,
  ExecutableContentHasher,
} from "../../src/index.js";

import type { ExecutableContent } from "@parmana/shared";

const crypto = CryptoBootstrap.create();

const CONTENT: ExecutableContent = {
  businessTransactionId: "txn-1",
  action: "TransferFunds",
  target: "account/12345",
  parameters: { amount: 100 },
};

const REQUIRED = {
  decisionId: "decision-1",
  businessTransactionId: "txn-1",
  policyName: "customer-refund",
  policyVersion: "1.2.0",
  executableContent: CONTENT,
};

const OPTIONAL_KEYS = [
  "decisionOutcome",
  "policyContentHash",
  "signalsHash",
  "submittedBy",
  "grantedCapability",
  "businessConditions",
  "authorityGrant",
] as const;

async function signPayload(input: Record<string, unknown>, ttlSeconds = 60) {
  const { privateKey } = generateKeyPairSync("ed25519");
  const signed = await new AuthorizationSigner(crypto).sign(
    input as typeof REQUIRED,
    privateKey,
    "key-1",
    ttlSeconds,
  );
  return signed.payload as unknown as Record<string, unknown>;
}

describe("AuthorizationSigner payload: optional fields", () => {
  it("includes every optional field when it is given", async () => {
    const payload = await signPayload({
      ...REQUIRED,
      decisionOutcome: "APPROVED",
      policyContentHash: "p".repeat(64),
      signalsHash: "s".repeat(64),
      submittedBy: "maker-1",
      grantedCapability: "refund.create",
      businessConditions: [{ field: "amount", op: "lte", value: 1000 }],
      authorityGrant: { grantId: "grant-1" },
    });

    expect(payload.decisionOutcome).toBe("APPROVED");
    expect(payload.policyContentHash).toBe("p".repeat(64));
    expect(payload.signalsHash).toBe("s".repeat(64));
    expect(payload.submittedBy).toBe("maker-1");
    expect(payload.grantedCapability).toBe("refund.create");
    expect(payload.businessConditions).toEqual([
      { field: "amount", op: "lte", value: 1000 },
    ]);
    expect(payload.authorityGrant).toEqual({ grantId: "grant-1" });
  });

  it("omits every optional field when none is given", async () => {
    const payload = await signPayload({ ...REQUIRED });

    for (const key of OPTIONAL_KEYS) {
      expect(payload, key).not.toHaveProperty(key);
    }
  });

  it("omits each optional field on its own when only the others are given", async () => {
    const values: Record<(typeof OPTIONAL_KEYS)[number], unknown> = {
      decisionOutcome: "APPROVED",
      policyContentHash: "p".repeat(64),
      signalsHash: "s".repeat(64),
      submittedBy: "maker-1",
      grantedCapability: "refund.create",
      businessConditions: [{ field: "amount", op: "lte", value: 1000 }],
      authorityGrant: { grantId: "grant-1" },
    };

    for (const key of OPTIONAL_KEYS) {
      const others = Object.fromEntries(
        OPTIONAL_KEYS.filter((other) => other !== key).map((other) => [
          other,
          values[other],
        ]),
      );

      const payload = await signPayload({ ...REQUIRED, ...others });

      expect(payload, key).not.toHaveProperty(key);
    }
  });

  it("omits businessConditions when the array is empty", async () => {
    const payload = await signPayload({ ...REQUIRED, businessConditions: [] });

    expect(payload).not.toHaveProperty("businessConditions");
  });

  it("includes businessConditions when it holds one condition", async () => {
    const payload = await signPayload({
      ...REQUIRED,
      businessConditions: [{ field: "amount", op: "lte", value: 1000 }],
    });

    expect(payload.businessConditions).toHaveLength(1);
  });
});

describe("AuthorizationSigner payload: timing and identity", () => {
  it("sets expiresAt exactly ttlSeconds after authorizedAt", async () => {
    const payload = await signPayload({ ...REQUIRED }, 120);

    const issued = new Date(payload.authorizedAt as string).getTime();
    const expires = new Date(payload.expiresAt as string).getTime();

    expect(expires - issued).toBe(120_000);
  });

  it("refuses a TTL of zero, a negative TTL, NaN and Infinity, and names the value", async () => {
    for (const ttl of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(signPayload({ ...REQUIRED }, ttl)).rejects.toThrow(
        `Invalid authorization TTL: ${ttl}`,
      );
    }
  });

  it("accepts a TTL just above zero", async () => {
    const payload = await signPayload({ ...REQUIRED }, 0.5);

    expect(payload.expiresAt).toBeDefined();
  });

  it("gives each authorization its own authorizationId and nonce", async () => {
    const first = await signPayload({ ...REQUIRED });
    const second = await signPayload({ ...REQUIRED });

    expect(first.authorizationId).not.toBe(second.authorizationId);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.authorizationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("binds the payload to the hash of the executable content", async () => {
    const payload = await signPayload({ ...REQUIRED });

    const expected = await new ExecutableContentHasher(crypto).hash(CONTENT);

    expect(payload.businessTransactionHash).toBe(expected);
  });
});
