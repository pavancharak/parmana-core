import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";
import { AuthorizationSigner, CryptoBootstrap } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { ExecutionRequest } from "@parmana/execution-system";
import type { ExecutableContent, ExecutionResult } from "@parmana/shared";

import {
  CapabilityConnectorPolicy,
  DefaultExecutionChannel,
  DefaultSecureConnector,
  ExecutionGateway,
  InMemoryConnectorRegistry,
  InMemoryGatewaySessionAuthority,
  MemoryExecutionAuditSink,
  type CredentialLease,
  type CredentialReference,
  type CredentialVault,
  type GatewayExecutionRequest,
} from "../../src/index.js";

const crypto = CryptoBootstrap.create();
const content: ExecutableContent = {
  businessTransactionId: "txn-controlled-1",
  action: "CreateCharge",
  target: "stripe/accounts/acct-1",
  parameters: { amount: 1000, currency: "usd" },
};

class RecordingVault implements CredentialVault {
  acquisitions = 0;
  releases = 0;
  readonly credential = Object.freeze({ secret: "connector-only" });

  async acquire(_reference: CredentialReference): Promise<CredentialLease> {
    this.acquisitions += 1;
    return {
      handle: this.credential,
      release: async () => {
        this.releases += 1;
      },
    };
  }
}

async function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const authorization = await new AuthorizationSigner(crypto).sign(
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
  const request: ExecutionRequest = { ...content, authorization };
  const sessions = new InMemoryGatewaySessionAuthority();
  const registry = new InMemoryConnectorRegistry();
  const audit = new MemoryExecutionAuditSink();
  const vault = new RecordingVault();
  const gatewayPresentation = Object.freeze({ workload: "gateway" });
  let receivedCredential: unknown;
  const connector = new DefaultSecureConnector({
    identity: {
      connectorId: "stripe",
      serviceIdentity: "spiffe://parmana/connectors/stripe",
    },
    capabilities: {
      actions: ["CreateCharge"],
      targetPrefixes: ["stripe/accounts/"],
    },
    credential: { connectorId: "stripe", name: "production" },
    sessions,
    policy: new CapabilityConnectorPolicy(),
    vault,
    target: {
      async execute(transaction, credential): Promise<ExecutionResult> {
        receivedCredential = credential;
        return {
          ...transaction,
          success: true,
          executedAt: new Date(),
          metadata: {},
        };
      },
    },
    audit,
  });
  registry.register(connector);
  const channel = new DefaultExecutionChannel({
    registry,
    sessions,
    audit,
    gatewayIdentity: gatewayPresentation,
  });
  const gateway = new ExecutionGateway({
    // Legacy fixture: predates fail-closed policy binding.
    allowUnverifiedPolicy: true,
    publicKey,
    nonceStore: new MemoryNonceStore(),
    executionControl: {
      channel,
      gatewayIdentity: { present: () => gatewayPresentation },
      route: () => "stripe",
    },
  });
  return {
    gateway,
    channel,
    connector,
    sessions,
    audit,
    vault,
    request,
    authorization,
    getCredential: () => receivedCredential,
  };
}

describe("execution control", () => {
  it("routes a verified action through an authenticated connector and isolates credentials", async () => {
    const f = await fixture();
    const result = await f.gateway.execute(f.request);

    expect(result.success).toBe(true);
    expect(f.vault.acquisitions).toBe(1);
    expect(f.vault.releases).toBe(1);
    expect(f.getCredential()).toBe(f.vault.credential);
    expect(JSON.stringify(f.request)).not.toContain("connector-only");
    expect(f.audit.events.map((event) => event.type)).toEqual([
      "session.opened",
      "credential.acquired",
      "execution.completed",
    ]);
  });

  it("rejects a direct connector call and never acquires credentials", async () => {
    const f = await fixture();
    const fake: GatewayExecutionRequest = {
      executionId: f.authorization.payload.authorizationId,
      connectorId: "stripe",
      transaction: content,
      authorization: f.authorization,
      verification: {
        valid: true,
        checks: {
          versionSupported: true,
          signatureVerified: true,
          notExpired: true,
          ttlWithinPolicy: true,
          businessTransactionHashMatches: true,
          nonceUnseen: true,
        },
      },
    };

    await expect(
      f.connector.invoke({
        ...fake,
        session: {
          sessionId: "forged",
          connectorId: "stripe",
          executionId: fake.executionId,
          authorizationId: f.authorization.payload.authorizationId,
          contentHash: f.authorization.payload.businessTransactionHash,
          expiresAt: f.authorization.payload.expiresAt,
        },
      }),
    ).rejects.toThrow("Secure Connector rejected");
    expect(f.vault.acquisitions).toBe(0);
  });

  it("rejects a direct channel call without the Gateway workload identity", async () => {
    const f = await fixture();
    const forged: GatewayExecutionRequest = {
      executionId: "forged-execution",
      connectorId: "stripe",
      transaction: content,
      authorization: f.authorization,
      verification: {
        valid: true,
        checks: {
          versionSupported: true,
          signatureVerified: true,
          notExpired: true,
          ttlWithinPolicy: true,
          businessTransactionHashMatches: true,
          nonceUnseen: true,
        },
      },
    };
    await expect(
      f.channel.release(forged, { workload: "gateway" }),
    ).rejects.toThrow("unauthenticated caller");
    expect(f.vault.acquisitions).toBe(0);
  });

  it("binds and consumes a gateway session exactly once", async () => {
    const f = await fixture();
    const base: GatewayExecutionRequest = {
      executionId: "execution-1",
      connectorId: "stripe",
      transaction: content,
      authorization: f.authorization,
      verification: {
        valid: true,
        checks: {
          versionSupported: true,
          signatureVerified: true,
          notExpired: true,
          ttlWithinPolicy: true,
          businessTransactionHashMatches: true,
          nonceUnseen: true,
        },
      },
    };
    const session = await f.sessions.open(base);
    await f.connector.invoke({ ...base, session });
    await expect(f.connector.invoke({ ...base, session })).rejects.toThrow();
    expect(f.vault.acquisitions).toBe(1);
  });

  it("denies actions outside connector capabilities before credential acquisition", async () => {
    const f = await fixture();
    const base: GatewayExecutionRequest = {
      executionId: "execution-2",
      connectorId: "stripe",
      transaction: { ...content, action: "DeleteAccount" },
      authorization: f.authorization,
      verification: {
        valid: true,
        checks: {
          versionSupported: true,
          signatureVerified: true,
          notExpired: true,
          ttlWithinPolicy: true,
          businessTransactionHashMatches: true,
          nonceUnseen: true,
        },
      },
    };
    const session = await f.sessions.open(base);
    await expect(f.connector.invoke({ ...base, session })).rejects.toThrow();
    expect(f.vault.acquisitions).toBe(0);
  });
});
