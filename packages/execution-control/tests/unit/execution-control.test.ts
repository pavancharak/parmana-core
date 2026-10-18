import { generateKeyPairSync } from "node:crypto";

import { AuthorizationSigner, CryptoBootstrap } from "@parmana/crypto";
import type { ExecutableContent, ExecutionResult } from "@parmana/shared";
import { describe, expect, it } from "vitest";

import {
  DefaultConnectorPolicy,
  ExecutionControlService,
  InMemoryConnectorAuthenticator,
  InMemoryConnectorRegistry,
  InMemoryCredentialVault,
  InMemoryGatewaySessionStore,
  InMemorySecureConnector,
  MemoryExecutionAuditSink,
  type ExecutionRelease,
  type GatewayExecutionRequest,
  type GatewayIdentity,
} from "../../src/index.js";

const content: ExecutableContent = {
  businessTransactionId: "txn-1",
  action: "CreateCharge",
  target: "stripe/account/1",
  parameters: { amount: 1000, currency: "usd" },
};

async function fixture() {
  const { privateKey } = generateKeyPairSync("ed25519");
  const authorization = await new AuthorizationSigner(
    CryptoBootstrap.create(),
  ).sign(
    {
      decisionId: "decision-1",
      decisionOutcome: "APPROVED",
      businessTransactionId: content.businessTransactionId,
      policyName: "payments",
      policyVersion: "1.0.0",
      executableContent: content,
    },
    privateKey,
    "key-1",
    60,
  );
  const gatewayIdentity: GatewayIdentity = {
    gatewayId: "gateway-1",
    publicIdentity: "spiffe://parmana/gateway",
    authenticationMetadata: { mechanism: "in-memory-token" },
  };
  const connectorIdentity = {
    connectorId: "stripe",
    publicIdentity: "spiffe://parmana/connectors/stripe",
    authenticationMetadata: { mechanism: "in-memory-registry" },
  };
  const gatewayAuthentication = Object.freeze({ token: "gateway-only" });
  const sessionIssuanceAuthentication = Object.freeze({
    capability: "session-issuer",
  });
  const sessions = new InMemoryGatewaySessionStore(
    sessionIssuanceAuthentication,
  );
  const authenticator = new InMemoryConnectorAuthenticator(
    gatewayIdentity,
    gatewayAuthentication,
    [connectorIdentity],
  );
  const policy = new DefaultConnectorPolicy(authenticator, sessions);
  const vault = new InMemoryCredentialVault();
  vault.setCredential("stripe", {
    value: Object.freeze({ apiKey: "connector-secret" }),
  });
  let credentialUses = 0;
  const connector = new InMemorySecureConnector({
    identity: connectorIdentity,
    capabilities: ["CreateCharge"],
    policy,
    gatewayAuthentication,
    credentialVault: vault,
    executor: {
      async execute(executableContent, credential): Promise<ExecutionResult> {
        expect(credential.value).toEqual({ apiKey: "connector-secret" });
        credentialUses += 1;
        return {
          ...executableContent,
          success: true,
          executedAt: new Date(),
          metadata: {},
        };
      },
    },
  });
  const registry = new InMemoryConnectorRegistry([connector]);
  const audit = new MemoryExecutionAuditSink();
  const service = new ExecutionControlService({
    // Unit test of control logic; release verification is tested elsewhere.
    verifyRelease: async () => {},
    gatewayIdentity,
    authenticator,
    registry,
    sessions,
    audit,
    sessionIssuanceAuthentication,
  });
  const release: ExecutionRelease = {
    authorization,
    executableContent: content,
    verifiedTransaction: {
      authorizationVerified: true,
      executableContentVerified: true,
      replayCheckPassed: true,
    },
    executionTimestamp: new Date().toISOString(),
  };
  return {
    authorization,
    gatewayIdentity,
    gatewayAuthentication,
    sessionIssuanceAuthentication,
    sessions,
    connector,
    registry,
    service,
    release,
    audit,
    credentialUses: () => credentialUses,
  };
}

function connectorRequest(
  f: Awaited<ReturnType<typeof fixture>>,
  session = f.sessions.create(
    f.release,
    "stripe",
    30_000,
    f.sessionIssuanceAuthentication,
  ),
): GatewayExecutionRequest {
  return {
    authorization: f.authorization,
    executableContent: content,
    verifiedTransaction: f.release.verifiedTransaction,
    executionTimestamp: f.release.executionTimestamp,
    gatewayIdentity: f.gatewayIdentity,
    gatewaySession: session,
  };
}

describe("execution control", () => {
  it("executes a valid request without exposing credentials", async () => {
    const f = await fixture();
    await expect(
      f.service.execute(f.release, f.gatewayAuthentication),
    ).resolves.toMatchObject({ success: true });
    expect(f.credentialUses()).toBe(1);
    expect(JSON.stringify(f.release)).not.toContain("connector-secret");
  });

  it("rejects an unauthenticated Gateway", async () => {
    const f = await fixture();
    await expect(
      f.service.execute(f.release, { token: "gateway-only" }),
    ).rejects.toThrow("unauthenticated Gateway");
    expect(f.credentialUses()).toBe(0);
  });

  it("rejects an expired session", async () => {
    const f = await fixture();
    const session = f.sessions.create(
      f.release,
      "stripe",
      1,
      f.sessionIssuanceAuthentication,
      new Date(Date.now() - 10),
    );
    await expect(
      f.connector.execute(connectorRequest(f, session)),
    ).rejects.toThrow("expired");
    expect(f.credentialUses()).toBe(0);
  });

  it("rejects a reused session", async () => {
    const f = await fixture();
    const request = connectorRequest(f);
    await f.connector.execute(request);
    await expect(f.connector.execute(request)).rejects.toThrow("reused");
    expect(f.credentialUses()).toBe(1);
  });

  it("rejects modified executable content", async () => {
    const f = await fixture();
    const request = connectorRequest(f);
    await expect(
      f.connector.execute({
        ...request,
        executableContent: { ...content, parameters: { amount: 9999 } },
      }),
    ).rejects.toThrow("modified");
    expect(f.credentialUses()).toBe(0);
  });

  it("rejects modified authorization", async () => {
    const f = await fixture();
    const request = connectorRequest(f);
    await expect(
      f.connector.execute({
        ...request,
        authorization: {
          ...f.authorization,
          signature: `${f.authorization.signature}x`,
        },
      }),
    ).rejects.toThrow("modified");
    expect(f.credentialUses()).toBe(0);
  });

  it.each(["Runtime", "AI"])(
    "rejects a direct %s connector invocation",
    async () => {
      const f = await fixture();
      await expect(
        f.connector.execute({
          ...connectorRequest(f),
          gatewaySession: {
            sessionId: "forged",
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30_000).toISOString(),
            authorizationId: f.authorization.payload.authorizationId,
          },
        }),
      ).rejects.toThrow("invalid");
      expect(f.credentialUses()).toBe(0);
    },
  );

  it("returns the registered connector and rejects unknown names", async () => {
    const f = await fixture();
    expect(f.registry.get("stripe")).toBe(f.connector);
    expect(() => f.registry.get("sap")).toThrow("Unknown connector");
  });

  it("lists every registered connector", async () => {
    const f = await fixture();
    expect(f.registry.list()).toEqual([f.connector]);
  });

  it("unregisters a connector, after which get() and list() no longer see it", async () => {
    const f = await fixture();
    f.registry.unregister("stripe");
    expect(() => f.registry.get("stripe")).toThrow("Unknown connector");
    expect(f.registry.list()).toEqual([]);
    expect(() => f.registry.unregister("stripe")).toThrow("Unknown connector");
  });

  it("creates distinct one-time sessions for releases", async () => {
    const f = await fixture();
    const first = f.sessions.create(
      f.release,
      "stripe",
      30_000,
      f.sessionIssuanceAuthentication,
    );
    const second = f.sessions.create(
      f.release,
      "stripe",
      30_000,
      f.sessionIssuanceAuthentication,
    );
    expect(first.sessionId).not.toBe(second.sessionId);
    expect(first.authorizationId).toBe(f.authorization.payload.authorizationId);
  });

  it("rejects session creation by Runtime or AI callers", async () => {
    const f = await fixture();
    expect(() => f.sessions.create(f.release, "stripe", 30_000, {})).toThrow(
      "unauthenticated caller",
    );
  });
});
