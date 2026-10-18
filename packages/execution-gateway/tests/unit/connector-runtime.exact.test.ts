import { describe, expect, it, vi } from "vitest";

import { CryptoBootstrap, ExecutableContentHasher } from "@parmana/crypto";
import type {
  ExecutableContent,
  ExecutionResult,
  SignedExecutionAuthorization,
} from "@parmana/shared";

import {
  CapabilityConnectorPolicy,
  DefaultExecutionChannel,
  DefaultSecureConnector,
  InMemoryConnectorRegistry,
  InMemoryGatewaySessionAuthority,
  MemoryExecutionAuditSink,
  deepFreeze,
  type AuthenticatedConnectorRequest,
  type GatewayExecutionRequest,
  type GatewaySession,
  type GatewaySessionAuthority,
  type SecureConnector,
} from "../../src/index.js";
import type { GatewayVerificationResult } from "../../src/GatewayVerificationResult.js";

/**
 * Mutation testing found that the checks between the Gateway and a
 * connector were tested only as a whole: any one field of the session
 * binding, either content hash comparison, the connector id and target
 * prefix checks, the channel's refusal of an unverified request, and
 * the deep freeze of released content could each be removed without a
 * test failing. Each is pinned here on its own.
 */

const TRANSACTION: ExecutableContent = {
  businessTransactionId: "txn-1",
  action: "payments:refund",
  target: "orders/42",
  parameters: { amount: 100, lines: [{ sku: "a" }] },
};

const hasher = new ExecutableContentHasher(CryptoBootstrap.create());

const IDENTITY = { connectorId: "stripe", serviceIdentity: "svc-stripe" };

function requestWith(
  overrides: {
    connectorId?: string;
    executionId?: string;
    authorizationId?: string;
    businessTransactionHash?: string;
    expiresAt?: string;
    transaction?: ExecutableContent;
    valid?: boolean;
  } = {},
): GatewayExecutionRequest {
  return {
    executionId: overrides.executionId ?? "exec-1",
    connectorId: overrides.connectorId ?? "stripe",
    transaction: overrides.transaction ?? TRANSACTION,
    authorization: {
      payload: {
        authorizationId: overrides.authorizationId ?? "auth-1",
        businessTransactionHash: overrides.businessTransactionHash ?? "hash-1",
        expiresAt:
          overrides.expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
      },
    } as unknown as SignedExecutionAuthorization,
    verification: {
      valid: overrides.valid ?? true,
    } as GatewayVerificationResult,
  };
}

describe("InMemoryGatewaySessionAuthority", () => {
  it("accepts the session it opened, for the same request, once", async () => {
    const authority = new InMemoryGatewaySessionAuthority();
    const request = requestWith();
    const session = await authority.open(request);

    expect(await authority.verifyAndConsume(session, request, IDENTITY)).toBe(
      true,
    );
    expect(await authority.verifyAndConsume(session, request, IDENTITY)).toBe(
      false,
    );
  });

  it.each([
    ["another connector in the request", { connectorId: "paypal" }],
    ["another execution", { executionId: "exec-2" }],
    ["another authorization", { authorizationId: "auth-2" }],
    ["other content", { businessTransactionHash: "hash-2" }],
  ])("refuses %s", async (_label, change) => {
    const authority = new InMemoryGatewaySessionAuthority();
    const session = await authority.open(requestWith());

    expect(
      await authority.verifyAndConsume(session, requestWith(change), IDENTITY),
    ).toBe(false);
  });

  it("refuses a connector presenting another identity", async () => {
    const authority = new InMemoryGatewaySessionAuthority();
    const request = requestWith();
    const session = await authority.open(request);

    expect(
      await authority.verifyAndConsume(session, request, {
        ...IDENTITY,
        connectorId: "paypal",
      }),
    ).toBe(false);
  });

  it("refuses a session expiring now, accepts one expiring a moment later", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00.000Z") });
    try {
      const authority = new InMemoryGatewaySessionAuthority();
      const atNow = requestWith({ expiresAt: "2026-10-05T12:00:00.000Z" });
      const later = requestWith({ expiresAt: "2026-10-05T12:00:00.001Z" });

      expect(
        await authority.verifyAndConsume(
          await authority.open(atNow),
          atNow,
          IDENTITY,
        ),
      ).toBe(false);
      expect(
        await authority.verifyAndConsume(
          await authority.open(later),
          later,
          IDENTITY,
        ),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    "connectorId",
    "executionId",
    "authorizationId",
    "contentHash",
    "expiresAt",
  ] as const)(
    "refuses a presented session whose %s differs from the one opened",
    async (field) => {
      const authority = new InMemoryGatewaySessionAuthority();
      const request = requestWith();
      const session = await authority.open(request);
      const altered = { ...session, [field]: "altered" } as GatewaySession;

      expect(await authority.verifyAndConsume(altered, request, IDENTITY)).toBe(
        false,
      );
      // The genuine session is still unused.
      expect(await authority.verifyAndConsume(session, request, IDENTITY)).toBe(
        true,
      );
    },
  );

  it("refuses a session it never opened", async () => {
    const authority = new InMemoryGatewaySessionAuthority();
    const request = requestWith();
    const session = await authority.open(request);

    expect(
      await authority.verifyAndConsume(
        { ...session, sessionId: "unknown" },
        request,
        IDENTITY,
      ),
    ).toBe(false);
  });
});

describe("CapabilityConnectorPolicy", () => {
  const policy = new CapabilityConnectorPolicy();
  const capabilities = {
    actions: ["payments:refund"],
    targetPrefixes: ["customers/", "orders/"],
  };

  it("allows a listed action on a target under any listed prefix", () => {
    expect(policy.allows(requestWith(), IDENTITY, capabilities)).toBe(true);
  });

  it("refuses a request addressed to another connector", () => {
    expect(
      policy.allows(
        requestWith({ connectorId: "paypal" }),
        IDENTITY,
        capabilities,
      ),
    ).toBe(false);
  });

  it("refuses an action or a target it does not list", () => {
    expect(
      policy.allows(
        requestWith({
          transaction: { ...TRANSACTION, action: "payments:pay" },
        }),
        IDENTITY,
        capabilities,
      ),
    ).toBe(false);
    expect(
      policy.allows(
        requestWith({ transaction: { ...TRANSACTION, target: "admin/1" } }),
        IDENTITY,
        capabilities,
      ),
    ).toBe(false);
  });
});

describe("InMemoryConnectorRegistry and DefaultExecutionChannel", () => {
  const connector = {
    identity: IDENTITY,
    capabilities: { actions: [], targetPrefixes: [] },
    invoke: vi.fn(async () => ({}) as ExecutionResult),
  } as unknown as SecureConnector;

  it("refuses to register a connector id twice", () => {
    const registry = new InMemoryConnectorRegistry();
    registry.register(connector);
    expect(() => registry.register(connector)).toThrow(
      "Connector already registered: stripe.",
    );
  });

  const channelWith = (registry: InMemoryConnectorRegistry) =>
    new DefaultExecutionChannel({
      registry,
      sessions: new InMemoryGatewaySessionAuthority(),
      audit: new MemoryExecutionAuditSink(),
      gatewayIdentity: "gateway",
    });

  it("refuses a request the Gateway did not verify", async () => {
    const registry = new InMemoryConnectorRegistry();
    registry.register(connector);

    await expect(
      channelWith(registry).release(requestWith({ valid: false }), "gateway"),
    ).rejects.toThrow("Execution Channel requires a verified Gateway request.");
    expect(connector.invoke).not.toHaveBeenCalled();
  });

  it("refuses a connector that is not registered", async () => {
    await expect(
      channelWith(new InMemoryConnectorRegistry()).release(
        requestWith(),
        "gateway",
      ),
    ).rejects.toThrow("Unknown connector: stripe.");
  });
});

describe("DefaultSecureConnector", () => {
  async function invokeWith(options: {
    sessionHash: string;
    authorizationHash: string;
    sessionValid?: boolean;
    allowed?: boolean;
  }) {
    const audit = new MemoryExecutionAuditSink();
    const target = {
      execute: vi.fn(async () => ({ success: true }) as ExecutionResult),
    };
    const sessions: GatewaySessionAuthority = {
      open: async () => {
        throw new Error("not used");
      },
      verifyAndConsume: async () => options.sessionValid ?? true,
    };
    const connector = new DefaultSecureConnector({
      identity: IDENTITY,
      capabilities: { actions: [], targetPrefixes: [] },
      credential: { connectorId: "stripe", name: "c-1" },
      sessions,
      policy: { allows: () => options.allowed ?? true },
      vault: {
        acquire: async () => ({ handle: "secret", release: async () => {} }),
      },
      target,
      audit,
    });
    const request = {
      ...requestWith({ businessTransactionHash: options.authorizationHash }),
      session: {
        sessionId: "s-1",
        contentHash: options.sessionHash,
      } as GatewaySession,
    } as AuthenticatedConnectorRequest;

    const outcome = await connector.invoke(request).then(
      () => "executed",
      (error: Error) => error.message,
    );
    return { outcome, target, events: audit.events };
  }

  it("executes only when the content hashes to both the session's and the authorization's hash", async () => {
    const hash = await hasher.hash(TRANSACTION);

    const ok = await invokeWith({ sessionHash: hash, authorizationHash: hash });
    expect(ok.outcome).toBe("executed");
    expect(ok.events.map((event) => event.type)).toEqual([
      "credential.acquired",
      "execution.completed",
    ]);
    expect(ok.events[1]).toMatchObject({ success: true });
    expect(ok.events[1]).not.toHaveProperty("reason");

    for (const [sessionHash, authorizationHash] of [
      [hash, "other"],
      ["other", hash],
    ]) {
      const refused = await invokeWith({ sessionHash, authorizationHash });
      expect(refused.outcome).toBe("Secure Connector rejected request.");
      expect(refused.target.execute).not.toHaveBeenCalled();
      expect(refused.events[0]).toMatchObject({
        type: "execution.rejected",
        reason: "gateway_authentication_failed",
      });
      expect(refused.events[0]).not.toHaveProperty("success");
    }
  });

  it("names the reason: a failed session versus a capability the policy denies", async () => {
    const hash = await hasher.hash(TRANSACTION);

    const badSession = await invokeWith({
      sessionHash: hash,
      authorizationHash: hash,
      sessionValid: false,
    });
    expect(badSession.events[0]).toMatchObject({
      type: "execution.rejected",
      reason: "gateway_authentication_failed",
    });

    const denied = await invokeWith({
      sessionHash: hash,
      authorizationHash: hash,
      allowed: false,
    });
    expect(denied.outcome).toBe("Secure Connector rejected request.");
    expect(denied.events[0]).toMatchObject({
      type: "execution.rejected",
      reason: "capability_denied",
    });
  });
});

describe("deepFreeze", () => {
  it("freezes every nested object and array, and returns the same value", () => {
    const value = { a: { b: [1, { c: 2 }] }, d: "x" };
    const frozen = deepFreeze(value);

    expect(frozen).toBe(value);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.a)).toBe(true);
    expect(Object.isFrozen(value.a.b)).toBe(true);
    expect(Object.isFrozen(value.a.b[1])).toBe(true);
  });

  it("returns primitives and null unchanged", () => {
    expect(deepFreeze(null)).toBe(null);
    expect(deepFreeze(5)).toBe(5);
    expect(deepFreeze("s")).toBe("s");
  });
});
