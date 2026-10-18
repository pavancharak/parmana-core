import { describe, expect, it } from "vitest";

import { PolicyAction, type Policy } from "@parmana/policy";
import { AuthorityStatus, type AuthorityGrant } from "@parmana/shared";

import {
  AuthorityGrantEvaluator,
  type AuthorityGrantSource,
} from "../../src/authority/AuthorityGrantEvaluator.js";

const NOW = new Date("2026-10-11T12:00:00.000Z");

const POLICY: Policy = {
  policyId: "release-goods",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",
  requireAuthorityGrant: true,
  rules: [
    {
      id: "always",
      condition: { always: true },
      outcome: { action: PolicyAction.REJECT, reason: "test" },
    },
  ],
};

function grant(overrides: Partial<AuthorityGrant> = {}): AuthorityGrant {
  return {
    grantId: "grant-1",
    callerId: "agent-x",
    capability: "erp:release-goods",
    limits: {
      "parameters.amount": { max: 100000 },
      "parameters.currency": { oneOf: ["INR"] },
    },
    validFrom: new Date("2026-10-01T00:00:00.000Z"),
    validUntil: new Date("2026-12-31T00:00:00.000Z"),
    status: "active",
    grantedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

function source(
  found: AuthorityGrant | null | (() => Promise<never>),
): AuthorityGrantSource & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async findActive(callerId, capability) {
      calls.push([callerId, capability]);
      return typeof found === "function" ? found() : found;
    },
  };
}

function evaluate(
  grants: AuthorityGrantSource | undefined,
  overrides: {
    policy?: Policy;
    callerId?: string | undefined;
    parameters?: Record<string, unknown>;
  } = {},
) {
  return new AuthorityGrantEvaluator(grants, { now: () => NOW }).evaluate({
    policy: overrides.policy ?? POLICY,
    callerId: "callerId" in overrides ? overrides.callerId : "agent-x",
    capability: "erp:release-goods",
    intent: {
      target: "invoices/INV-1",
      parameters: overrides.parameters ?? { amount: 50000, currency: "INR" },
    },
  });
}

describe("AuthorityGrantEvaluator (RFC-0023 phase 3)", () => {
  it("does nothing for a policy that does not require a grant", async () => {
    const grants = source(null);

    expect(
      await evaluate(grants, {
        policy: { ...POLICY, requireAuthorityGrant: false },
      }),
    ).toBeUndefined();
    expect(
      await evaluate(grants, {
        policy: { ...POLICY, requireAuthorityGrant: undefined },
      }),
    ).toBeUndefined();
    expect(grants.calls).toEqual([]);
  });

  it("authorizes a caller with a current grant, within its limits, and records the grant", async () => {
    const grants = source(grant());

    const result = await evaluate(grants);

    expect(grants.calls).toEqual([["agent-x", "erp:release-goods"]]);
    expect(result).toMatchObject({
      status: AuthorityStatus.AUTHORIZED,
      grant: {
        grantId: "grant-1",
        callerId: "agent-x",
        capability: "erp:release-goods",
        validUntil: new Date("2026-12-31T00:00:00.000Z"),
        limits: { "parameters.amount": { max: 100000 } },
      },
    });
  });

  it("is NOT_AUTHORIZED with no authenticated caller, and asks nothing", async () => {
    const grants = source(grant());

    const result = await evaluate(grants, { callerId: undefined });

    expect(result?.status).toBe(AuthorityStatus.NOT_AUTHORIZED);
    expect(result?.reason).toMatch(/no authenticated caller/);
    expect(grants.calls).toEqual([]);
  });

  it("is NOT_AUTHORIZED when the caller holds no grant", async () => {
    const result = await evaluate(source(null));

    expect(result?.status).toBe(AuthorityStatus.NOT_AUTHORIZED);
    expect(result?.reason).toMatch(/holds no authority grant/);
    expect(result?.grant).toBeUndefined();
  });

  it("is AUTHORITY_EXPIRED at and after validUntil", async () => {
    for (const validUntil of [NOW, new Date(NOW.getTime() - 1)]) {
      const result = await evaluate(source(grant({ validUntil })));

      expect(result?.status).toBe(AuthorityStatus.AUTHORITY_EXPIRED);
      expect(result?.grant?.grantId).toBe("grant-1");
    }
  });

  it("is NOT_AUTHORIZED before validFrom", async () => {
    const result = await evaluate(
      source(grant({ validFrom: new Date(NOW.getTime() + 1) })),
    );

    expect(result?.status).toBe(AuthorityStatus.NOT_AUTHORIZED);
    expect(result?.reason).toMatch(/in force only from/);
  });

  it.each([
    [
      "above the maximum",
      { amount: 100001, currency: "INR" },
      /above the granted maximum 100000/,
    ],
    [
      "a currency not granted",
      { amount: 10, currency: "USD" },
      /not one of \["INR"\]/,
    ],
    [
      "a string where a number is limited",
      { amount: "50000", currency: "INR" },
      /must be a number/,
    ],
    [
      "no value where a number is limited",
      { currency: "INR" },
      /nothing there/,
    ],
    ["no value where values are listed", { amount: 10 }, /nothing there/],
  ])("is NOT_AUTHORIZED for %s", async (_label, parameters, reason) => {
    const result = await evaluate(source(grant()), { parameters });

    expect(result?.status).toBe(AuthorityStatus.NOT_AUTHORIZED);
    expect(result?.reason).toMatch(reason);
    expect(result?.grant?.grantId).toBe("grant-1");
  });

  it("checks a minimum, and accepts the bounds themselves", async () => {
    const limited = grant({
      limits: { "parameters.amount": { min: 10, max: 20 } },
    });

    expect(
      (await evaluate(source(limited), { parameters: { amount: 9 } }))?.status,
    ).toBe(AuthorityStatus.NOT_AUTHORIZED);
    expect(
      (await evaluate(source(limited), { parameters: { amount: 10 } }))?.status,
    ).toBe(AuthorityStatus.AUTHORIZED);
    expect(
      (await evaluate(source(limited), { parameters: { amount: 20 } }))?.status,
    ).toBe(AuthorityStatus.AUTHORIZED);
  });

  it("limits the target too", async () => {
    const limited = grant({
      limits: { target: { oneOf: ["invoices/INV-2"] } },
    });

    expect((await evaluate(source(limited)))?.status).toBe(
      AuthorityStatus.NOT_AUTHORIZED,
    );
  });

  it("is AUTHORITY_UNCLEAR with no grant source, or one that fails", async () => {
    expect((await evaluate(undefined))?.status).toBe(
      AuthorityStatus.AUTHORITY_UNCLEAR,
    );

    const failing = await evaluate(
      source(async () => {
        throw new Error("database unavailable");
      }),
    );
    expect(failing?.status).toBe(AuthorityStatus.AUTHORITY_UNCLEAR);
    expect(failing?.reason).toMatch(/database unavailable/);
  });
});
