import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AuthorizationSigner, CryptoBootstrap } from "@parmana/crypto";

import { MemoryNonceStore } from "@parmana/envelope-verifier";

import type { ExecutionRequest } from "@parmana/execution-system";

import {
  type ExecutableContent,
  type ExecutionResult,
  type SignedExecutionAuthorization,
} from "@parmana/shared";

import type { Connector, ConnectorRequest } from "../../src/index.js";
import { ExecutionGateway } from "../../src/index.js";

const crypto = CryptoBootstrap.create();

const CONTENT: ExecutableContent = {
  businessTransactionId: "txn-invariants-1",
  action: "TransferFunds",
  target: "account/12345",
  parameters: { amount: 100 },
};

class CountingConnector implements Connector {
  public calls = 0;

  async execute(request: ConnectorRequest): Promise<ExecutionResult> {
    this.calls += 1;

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

async function sign(
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
  decisionOutcome: string = "APPROVED",
): Promise<SignedExecutionAuthorization> {
  const signer = new AuthorizationSigner(crypto);

  return signer.sign(
    {
      decisionId: "decision-invariants-1",
      // The type allows only "APPROVED". A payload signed with another value
      // is what a future or misbehaving issuer could produce, so the gateway
      // must refuse it on its own.
      decisionOutcome: decisionOutcome as "APPROVED",
      businessTransactionId: CONTENT.businessTransactionId,
      policyName: "policy-a",
      policyVersion: "1.0.0",
      executableContent: CONTENT,
    },
    privateKey,
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

describe("enforcement invariants: decision outcome", () => {
  it("refuses a payload whose decision is not APPROVED, without calling the connector or burning the nonce", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const authorization = await sign(privateKey, "DECLINED");
    const nonceStore = new MemoryNonceStore();
    const connector = new CountingConnector();

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore,
      connector,
    });

    const { result } = await gateway.verify(request(authorization));

    expect(result.valid).toBe(false);
    expect(result.checks.decisionApproved).toBe(false);
    expect(result.checks.authorizationNotRevoked).toBe(true);

    await expect(gateway.execute(request(authorization))).rejects.toThrow();
    expect(connector.calls).toBe(0);

    // The signature was genuine, so a refusal for the decision must leave the
    // nonce unrecorded. The same nonce is still unseen in the store.
    const nonceStillUnseen = await nonceStore.checkAndRecord(
      authorization.payload.nonce,
      authorization.payload.expiresAt,
    );
    expect(nonceStillUnseen).toBe(true);
  });
});

describe("enforcement invariants: verificationOnlyKeys", () => {
  it("refuses a capability outside the allowed list when the signing key is verification-only", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const authorization = await sign(privateKey);
    const connector = new CountingConnector();

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      connector,
      verificationOnlyKeys: {
        keyIds: ["key-1"],
        capabilities: ["ReadBalance"],
      },
    });

    const { result } = await gateway.verify(request(authorization));

    expect(result.checks.verificationKeyScope).toBe(false);
    expect(result.valid).toBe(false);
    await expect(gateway.execute(request(authorization))).rejects.toThrow();
    expect(connector.calls).toBe(0);
  });

  it("allows a capability on the verification-only key's list", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const authorization = await sign(privateKey);
    const connector = new CountingConnector();

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      connector,
      verificationOnlyKeys: {
        keyIds: ["key-1"],
        capabilities: ["TransferFunds"],
      },
    });

    const { result } = await gateway.verify(request(authorization));

    expect(result.checks.verificationKeyScope).toBe(true);
    expect(result.valid).toBe(true);
  });

  it("does not restrict a key that is not on the verification-only list", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const authorization = await sign(privateKey);

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      connector: new CountingConnector(),
      verificationOnlyKeys: {
        keyIds: ["some-other-key"],
        capabilities: ["ReadBalance"],
      },
    });

    const { result } = await gateway.verify(request(authorization));

    expect(result.checks.verificationKeyScope).toBe(true);
    expect(result.valid).toBe(true);
  });
});

describe("enforcement invariants: nonce under executionControl", () => {
  it("leaves the nonce unconsumed at the gateway, deferring it to the release verifier", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const authorization = await sign(privateKey);
    const nonceStore = new MemoryNonceStore();
    const releases: unknown[] = [];

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding. The nonce
      // behaviour under test does not depend on policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore,
      // Production wiring: the gateway routes through executionControl.
      executionControl: {
        service: {
          async execute(release) {
            releases.push(release);
            return {
              businessTransactionId: CONTENT.businessTransactionId,
              action: CONTENT.action,
              target: CONTENT.target,
              parameters: CONTENT.parameters,
              success: true,
              executedAt: new Date(),
              metadata: {},
            };
          },
        },
        route: () => "connector-a",
      },
    });

    const { result } = await gateway.verify(request(authorization));

    expect(result.checks.nonceUnseen).toBeUndefined();

    const dispatched = await gateway.execute(request(authorization));
    expect(dispatched.success).toBe(true);
    expect(releases).toHaveLength(1);

    // The gateway did not consume the nonce, so the store still reports it unseen.
    const stillUnseen = await nonceStore.checkAndRecord(
      authorization.payload.nonce,
      authorization.payload.expiresAt,
    );
    expect(stillUnseen).toBe(true);
  });
});
