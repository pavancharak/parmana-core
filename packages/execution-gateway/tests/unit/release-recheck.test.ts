import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AuthorizationSigner, CryptoBootstrap } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { ExecutionRequest } from "@parmana/execution-system";
import {
  AuthorizationNoLongerValidError,
  type AuthorityGrant,
  type ExecutableContent,
  type ExecutionResult,
  type SignedExecutionAuthorization,
} from "@parmana/shared";

import type { Connector, ConnectorRequest } from "../../src/index.js";
import { ExecutionGateway } from "../../src/index.js";

/**
 * RFC-0023 phase 4: what an authorization rests on must still hold at
 * release. The gateway refuses, before the connector is called and
 * without consuming the nonce, a release whose business condition is
 * past its signed validUntil, or whose authority grant has expired, was
 * revoked or replaced, or cannot be checked.
 */

const crypto = CryptoBootstrap.create();
const keys = generateKeyPairSync("ed25519");
const NOW = new Date();

const CONTENT: ExecutableContent = {
  businessTransactionId: "txn-recheck",
  action: "erp:release-goods",
  target: "invoices/INV-1",
  parameters: { amount: 500 },
};

class RecordingConnector implements Connector {
  public calls = 0;

  async execute(request: ConnectorRequest): Promise<ExecutionResult> {
    this.calls++;
    return {
      businessTransactionId: request.transaction.businessTransactionId,
      action: request.transaction.action,
      target: request.transaction.target,
      parameters: request.transaction.parameters,
      success: true,
      executedAt: new Date(),
      metadata: {},
    };
  }
}

const inMs = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

function sign(
  extra: {
    businessConditions?: { validUntil: string; signalKey?: string }[];
    authorityGrant?: { grantId: string; validUntil: string };
    submittedBy?: string;
  } = {},
): Promise<SignedExecutionAuthorization> {
  return new AuthorizationSigner(crypto).sign(
    {
      decisionId: "decision-1",
      decisionOutcome: "APPROVED",
      businessTransactionId: CONTENT.businessTransactionId,
      policyName: "policy-a",
      policyVersion: "1.0.0",
      executableContent: CONTENT,
      ...(extra.submittedBy !== undefined && {
        submittedBy: extra.submittedBy,
      }),
      ...(extra.businessConditions !== undefined && {
        businessConditions: extra.businessConditions.map((c, i) => ({
          signalId: `signal-${i}`,
          signalKey: c.signalKey ?? `fact${i}`,
          source: "erp",
          claim: "invoice.paid",
          subject: "INV-1",
          value: true,
          validUntil: c.validUntil,
        })),
      }),
      ...(extra.authorityGrant !== undefined && {
        authorityGrant: extra.authorityGrant,
      }),
    },
    keys.privateKey,
    "key-1",
    60,
  );
}

function request(
  authorization: SignedExecutionAuthorization,
): ExecutionRequest {
  return {
    businessTransactionId: CONTENT.businessTransactionId,
    action: CONTENT.action,
    target: CONTENT.target,
    parameters: CONTENT.parameters,
    authorization,
  };
}

function activeGrant(overrides: Partial<AuthorityGrant> = {}): AuthorityGrant {
  return {
    grantId: "grant-1",
    callerId: "agent-x",
    capability: "erp:release-goods",
    validFrom: new Date(NOW.getTime() - 86_400_000),
    validUntil: new Date(NOW.getTime() + 86_400_000),
    status: "active",
    grantedAt: new Date(NOW.getTime() - 86_400_000),
    ...overrides,
  };
}

function gateway(grants?: {
  findActive: () => Promise<AuthorityGrant | null>;
}) {
  const connector = new RecordingConnector();
  return {
    connector,
    gateway: new ExecutionGateway({
      // Policy binding is covered elsewhere; this file is about phase 4.
      allowUnverifiedPolicy: true,
      publicKey: keys.publicKey,
      nonceStore: new MemoryNonceStore(),
      connector,
      ...(grants !== undefined && { authorityGrants: grants }),
    }),
  };
}

describe("ExecutionGateway: re-check at release (RFC-0023 phase 4)", () => {
  it("releases while every business condition is current, and records the check", async () => {
    const { gateway: g, connector } = gateway();
    const authorization = await sign({
      businessConditions: [{ validUntil: inMs(30_000) }],
    });

    const { result } = await g.verify(request(authorization));
    expect(result.valid).toBe(true);
    expect(result.checks.businessConditionsCurrent).toBe(true);

    // verify() consumed that nonce; release a second authorization.
    await g.execute(
      request(
        await sign({ businessConditions: [{ validUntil: inMs(30_000) }] }),
      ),
    );
    expect(connector.calls).toBe(1);
  });

  it("refuses once any business condition is past its validUntil, naming it, without calling the connector or burning the nonce", async () => {
    const { gateway: g, connector } = gateway();
    const authorization = await sign({
      businessConditions: [
        { validUntil: inMs(30_000), signalKey: "invoicePaid" },
        { validUntil: inMs(-1), signalKey: "stockReserved" },
      ],
    });

    const { result } = await g.verify(request(authorization));
    expect(result.valid).toBe(false);
    expect(result.checks.businessConditionsCurrent).toBe(false);
    expect(result.checks.nonceUnseen).toBe(false);
    expect(result.expiredConditions).toEqual(["stockReserved"]);

    const refusal = await g
      .execute(request(authorization))
      .catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(AuthorizationNoLongerValidError);
    expect(refusal).toMatchObject({
      status: 409,
      code: "AUTHORIZATION_NO_LONGER_VALID",
      executionStatus: "NOT_EXECUTED",
    });
    expect((refusal as Error).message).toMatch(/stockReserved/);
    expect(connector.calls).toBe(0);
  });

  it("adds no check for an authorization without conditions or grant", async () => {
    const { gateway: g } = gateway();

    const { result } = await g.verify(request(await sign()));

    expect(result.valid).toBe(true);
    expect(result.checks).not.toHaveProperty("businessConditionsCurrent");
    expect(result.checks).not.toHaveProperty("authorityGrantInForce");
  });

  it("releases while the signed grant is still the active, unexpired one", async () => {
    const { gateway: g, connector } = gateway({
      findActive: async () => activeGrant(),
    });

    await g.execute(
      request(
        await sign({
          submittedBy: "agent-x",
          authorityGrant: { grantId: "grant-1", validUntil: inMs(86_400_000) },
        }),
      ),
    );

    expect(connector.calls).toBe(1);
  });

  it.each<
    [string, (() => Promise<AuthorityGrant | null>) | undefined, string, RegExp]
  >([
    ["revoked", async () => null, inMs(86_400_000), /revoked or replaced/],
    [
      "replaced by another grant",
      async () => activeGrant({ grantId: "grant-2" }),
      inMs(86_400_000),
      /revoked or replaced/,
    ],
    ["expired", async () => activeGrant(), inMs(-1), /expired/],
    [
      "shortened since the decision",
      async () => activeGrant({ validUntil: new Date(NOW.getTime() - 1) }),
      inMs(86_400_000),
      /expired/,
    ],
    [
      "unreadable",
      async () => {
        throw new Error("database unavailable");
      },
      inMs(86_400_000),
      /could not be read: database unavailable/,
    ],
    [
      "uncheckable, with no registry",
      undefined,
      inMs(86_400_000),
      /no grant registry/,
    ],
  ])(
    "refuses when the grant is %s, without calling the connector",
    async (_label, findActive, validUntil, reason) => {
      const { gateway: g, connector } = gateway(
        findActive === undefined ? undefined : { findActive },
      );
      const authorization = await sign({
        submittedBy: "agent-x",
        authorityGrant: { grantId: "grant-1", validUntil },
      });

      const { result } = await g.verify(request(authorization));
      expect(result.checks.authorityGrantInForce).toBe(false);
      expect(result.authorityGrantViolation?.reason).toMatch(reason);

      await expect(g.execute(request(authorization))).rejects.toBeInstanceOf(
        AuthorizationNoLongerValidError,
      );
      expect(connector.calls).toBe(0);
    },
  );

  it("refuses a signed grant with no caller to check it for", async () => {
    const { gateway: g } = gateway({ findActive: async () => activeGrant() });

    const { result } = await g.verify(
      request(
        await sign({
          authorityGrant: { grantId: "grant-1", validUntil: inMs(60_000) },
        }),
      ),
    );

    expect(result.checks.authorityGrantInForce).toBe(false);
  });

  it("stays a plain error, not a no-longer-valid refusal, when the authorization is also forged", async () => {
    const { gateway: g } = gateway();
    const authorization = await sign({
      businessConditions: [{ validUntil: inMs(-1) }],
    });
    const forged = {
      ...authorization,
      payload: { ...authorization.payload, decisionId: "decision-2" },
    };

    const error = await g
      .execute(request(forged))
      .catch((caught: unknown) => caught);

    expect(error).not.toBeInstanceOf(AuthorizationNoLongerValidError);
    expect((error as Error).message).toMatch(/signatureVerified/);
  });
});
