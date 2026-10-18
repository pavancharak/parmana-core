import { generateKeyPairSync } from "node:crypto";

import { AuthorizationSigner, CryptoBootstrap } from "@parmana/crypto";
import type { ExecutableContent } from "@parmana/shared";
import { describe, expect, it } from "vitest";

import {
  ExecutionControlService,
  GatewayAttestationSigner,
  InMemoryConnectorRegistry,
  InMemoryGatewaySessionStore,
  MemoryExecutionAuditSink,
  SessionCredentialExecutionControl,
  SignedTokenConnectorAuthenticator,
  type Clock,
  type ExecutionRelease,
  type GatewayIdentity,
  type GatewaySession,
  type IdGenerator,
  type SecureConnector,
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
    return `nonce-${this.counter}`;
  }
}

class CountingSessionStore extends InMemoryGatewaySessionStore {
  createCalls = 0;

  override create(
    release: ExecutionRelease,
    lifetimeMs: number,
    issuanceAuthentication: unknown,
    now?: Date,
  ): GatewaySession {
    this.createCalls += 1;
    return super.create(release, lifetimeMs, issuanceAuthentication, now);
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
  const { privateKey: wrongPrivateKey } = generateKeyPairSync("ed25519");

  // Deriving the real gateway keypair separately from the authorization
  // signing keypair keeps the two signature domains independent, matching
  // production (the authorization is signed by the Runtime, the
  // attestation by the Gateway).
  const gatewayKeyPair = generateKeyPairSync("ed25519");

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

  const authenticator = new SignedTokenConnectorAuthenticator(
    gatewayIdentity,
    gatewayKeyPair.publicKey,
    [],
  );

  const sessionIssuanceAuthentication = Object.freeze({});
  const sessions = new CountingSessionStore(sessionIssuanceAuthentication);
  const audit = new MemoryExecutionAuditSink();

  let connectorCalls = 0;
  const connector: SecureConnector = {
    connectorId: "sap",
    capabilities: ["CreateInvoice"],
    identity: {
      connectorId: "sap",
      publicIdentity: "spiffe://parmana/connectors/sap",
      authenticationMetadata: {},
    },
    async execute() {
      connectorCalls += 1;
      return {
        ...content,
        success: true,
        executedAt: new Date(),
        metadata: {},
      };
    },
  };
  const registry = new InMemoryConnectorRegistry([connector]);

  const inner = new ExecutionControlService({
    // Unit test of control logic; release verification is tested elsewhere.
    verifyRelease: async () => {},
    gatewayIdentity,
    authenticator,
    registry,
    sessions,
    sessionIssuanceAuthentication,
    audit,
  });

  const wrapped = new SessionCredentialExecutionControl({
    gatewayIdentity,
    authenticator,
    inner,
  });

  const signer = new GatewayAttestationSigner(
    new ManualClock(new Date("2026-01-01T00:00:00Z")),
    new SequentialIdGenerator(),
  );

  const release: ExecutionRelease = {
    connectorName: "sap",
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
    gatewayIdentity,
    gatewayKeyPair,
    wrongPrivateKey,
    authorization,
    signer,
    wrapped,
    sessions,
    release,
    connectorCalls: () => connectorCalls,
  };
}

describe("SessionCredentialExecutionControl", () => {
  it("creates a session and executes only after the attestation matches the request", async () => {
    const f = await fixture();
    const attestation = f.signer.sign(
      f.gatewayIdentity.gatewayId,
      f.authorization.payload.authorizationId,
      f.gatewayKeyPair.privateKey,
    );

    await expect(
      f.wrapped.execute(f.release, attestation),
    ).resolves.toMatchObject({ success: true });

    expect(f.connectorCalls()).toBe(1);
    expect(f.sessions.createCalls).toBe(1);
  });

  it("rejects a spoofed gateway attestation before any session is created", async () => {
    const f = await fixture();
    const spoofed = f.signer.sign(
      f.gatewayIdentity.gatewayId,
      f.authorization.payload.authorizationId,
      f.wrongPrivateKey,
    );

    await expect(f.wrapped.execute(f.release, spoofed)).rejects.toThrow(
      "does not match this request",
    );

    expect(f.connectorCalls()).toBe(0);
    expect(f.sessions.createCalls).toBe(0);
  });

  it("rejects a missing (undefined) attestation before any session is created", async () => {
    const f = await fixture();

    await expect(f.wrapped.execute(f.release, undefined)).rejects.toThrow(
      "does not match this request",
    );

    expect(f.connectorCalls()).toBe(0);
    expect(f.sessions.createCalls).toBe(0);
  });

  it("rejects a tampered attestation before any session is created", async () => {
    const f = await fixture();
    const attestation = f.signer.sign(
      f.gatewayIdentity.gatewayId,
      f.authorization.payload.authorizationId,
      f.gatewayKeyPair.privateKey,
    );
    const tampered = {
      ...attestation,
      payload: {
        ...attestation.payload,
        authorizationId: "some-other-authorization",
      },
    };

    await expect(f.wrapped.execute(f.release, tampered)).rejects.toThrow(
      "does not match this request",
    );

    expect(f.connectorCalls()).toBe(0);
    expect(f.sessions.createCalls).toBe(0);
  });
});
