import { generateKeyPairSync } from "node:crypto";

import { AuthorizationSigner, CryptoBootstrap } from "@parmana/crypto";
import type { ExecutableContent, ExecutionResult } from "@parmana/shared";
import { describe, expect, it } from "vitest";

import {
  DefaultConnectorPolicy,
  InMemoryConnectorAuthenticator,
  InMemoryCredentialVault,
  InMemoryGatewaySessionStore,
  InMemorySessionCredentialVault,
  MemoryExecutionAuditSink,
  SessionCredentialSecureConnector,
  type Clock,
  type ConnectorExecutor,
  type ConnectorIdentity,
  type ExecutionRelease,
  type GatewayExecutionRequest,
  type GatewayIdentity,
  type IdGenerator,
  type SessionCredentialVault,
} from "../../src/index.js";

class ManualClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }
}

class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `session-credential-${this.counter}`;
  }
}

const content: ExecutableContent = {
  businessTransactionId: "txn-1",
  action: "CreateInvoice",
  target: "sap/invoice/1",
  parameters: { amount: 500 },
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
    authenticationMetadata: {},
  };
  const connectorIdentity: ConnectorIdentity = {
    connectorId: "sap",
    publicIdentity: "spiffe://parmana/connectors/sap",
    authenticationMetadata: {},
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

  const credentials = new InMemoryCredentialVault();
  credentials.setCredential("sap", {
    value: Object.freeze({ apiKey: "sap-secret" }),
  });

  const inner = new InMemorySessionCredentialVault({
    credentials,
    clock: new ManualClock(new Date("2026-01-01T00:00:00Z")),
    idGenerator: new SequentialIdGenerator(),
    lifetimeMs: 30_000,
  });

  const revokedIds: string[] = [];
  const sessionCredentials: SessionCredentialVault = {
    issue: (connectorId, authorizationId) =>
      inner.issue(connectorId, authorizationId),
    consume: (id) => inner.consume(id),
    revoke: async (id) => {
      revokedIds.push(id);
      await inner.revoke(id);
    },
  };

  let executorCalls = 0;
  let failNext = false;
  const executor: ConnectorExecutor = {
    async execute(executableContent): Promise<ExecutionResult> {
      executorCalls += 1;
      if (failNext) throw new Error("executor failure");
      return {
        ...executableContent,
        success: true,
        executedAt: new Date(),
        metadata: {},
      };
    },
  };

  const audit = new MemoryExecutionAuditSink();
  const clock = new ManualClock(new Date("2026-01-01T00:00:10Z"));

  const connector = new SessionCredentialSecureConnector({
    identity: connectorIdentity,
    capabilities: ["CreateInvoice"],
    policy,
    gatewayAuthentication,
    sessionCredentials,
    executor,
    audit,
    clock,
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
    authenticator,
    sessions,
    connector,
    release,
    revokedIds,
    audit,
    executorCalls: () => executorCalls,
    setFailNext: (value: boolean) => {
      failNext = value;
    },
  };
}

function connectorRequest(
  f: Awaited<ReturnType<typeof fixture>>,
  session = f.sessions.create(
    f.release,
    "sap",
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

describe("SessionCredentialSecureConnector", () => {
  it("executes successfully and destroys the session credential after success", async () => {
    const f = await fixture();

    await expect(
      f.connector.execute(connectorRequest(f)),
    ).resolves.toMatchObject({ success: true });

    expect(f.executorCalls()).toBe(1);
    expect(f.revokedIds).toHaveLength(1);
  });

  it("destroys the session credential after a failing execution", async () => {
    const f = await fixture();
    f.setFailNext(true);

    await expect(f.connector.execute(connectorRequest(f))).rejects.toThrow(
      "executor failure",
    );

    expect(f.executorCalls()).toBe(1);
    expect(f.revokedIds).toHaveLength(1);
  });

  it("(a) rejects direct invocation with no genuine session (forged sessionId)", async () => {
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

    expect(f.executorCalls()).toBe(0);
    expect(f.revokedIds).toHaveLength(0);
  });

  it("(b) rejects direct invocation with an expired session", async () => {
    const f = await fixture();
    const session = f.sessions.create(
      f.release,
      "sap",
      1,
      f.sessionIssuanceAuthentication,
      new Date(Date.now() - 10),
    );

    await expect(
      f.connector.execute(connectorRequest(f, session)),
    ).rejects.toThrow("invalid");

    expect(f.executorCalls()).toBe(0);
    expect(f.revokedIds).toHaveLength(0);
  });

  it("(b) rejects direct invocation with an already-consumed (reused) session", async () => {
    const f = await fixture();
    const request = connectorRequest(f);

    await f.connector.execute(request);
    await expect(f.connector.execute(request)).rejects.toThrow("invalid");

    expect(f.executorCalls()).toBe(1);
    expect(f.revokedIds).toHaveLength(1);
  });

  it("(c) proves a valid frozen gatewayAuthentication alone grants nothing without a valid session", async () => {
    const f = await fixture();

    //
    // The connector's baked-in gatewayAuthentication genuinely passes the
    // authenticator in isolation...
    //
    expect(
      f.authenticator.authenticateGateway(
        f.gatewayIdentity,
        f.gatewayAuthentication,
      ),
    ).toBe(true);

    //
    // ...yet execution is still rejected without a real, gateway-issued
    // session — proving the static attestation is not, by itself,
    // sufficient to authorize anything.
    //
    await expect(
      f.connector.execute({
        ...connectorRequest(f),
        gatewaySession: {
          sessionId: "no-such-session",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
          authorizationId: f.authorization.payload.authorizationId,
        },
      }),
    ).rejects.toThrow("invalid");

    expect(f.executorCalls()).toBe(0);
    expect(f.revokedIds).toHaveLength(0);
  });

  it("records an execution.completed audit event naming connector, credential, gateway, and permit", async () => {
    const f = await fixture();

    await f.connector.execute(connectorRequest(f));

    expect(f.audit.events).toHaveLength(1);
    expect(f.audit.events[0]).toMatchObject({
      type: "execution.completed",
      occurredAt: "2026-01-01T00:00:10.000Z",
      connectorId: "sap",
      authorizationId: f.authorization.payload.authorizationId,
      credentialId: f.revokedIds[0],
      gatewayId: f.gatewayIdentity.gatewayId,
    });
  });

  it("records an execution.rejected audit event with a reason on policy failure", async () => {
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

    expect(f.audit.events).toHaveLength(1);
    expect(f.audit.events[0]).toMatchObject({
      type: "execution.rejected",
      connectorId: "sap",
      authorizationId: f.authorization.payload.authorizationId,
      gatewayId: f.gatewayIdentity.gatewayId,
    });
    expect(f.audit.events[0].credentialId).toBeUndefined();
    expect(f.audit.events[0].reason).toContain("invalid");
  });

  it("never writes the underlying credential secret into an audit record", async () => {
    const f = await fixture();

    await f.connector.execute(connectorRequest(f));
    f.setFailNext(true);
    await expect(f.connector.execute(connectorRequest(f))).rejects.toThrow(
      "executor failure",
    );

    expect(f.audit.events.length).toBeGreaterThan(0);
    expect(JSON.stringify(f.audit.events)).not.toContain("sap-secret");
  });
});
