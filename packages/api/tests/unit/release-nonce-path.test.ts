import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AuthorizationSigner, CryptoBootstrap } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import {
  ExecutionGateway,
  type Connector,
  type ConnectorRequest,
} from "@parmana/execution-gateway";
import type { ExecutionRequest } from "@parmana/execution-system";
import {
  NonceAlreadyConsumedError,
  type ExecutableContent,
  type ExecutionResult,
  type SignedExecutionAuthorization,
} from "@parmana/shared";

import { createReleaseVerifier } from "../../src/bootstrap/createReleaseVerifier.js";

const crypto = CryptoBootstrap.create();

const CONTENT: ExecutableContent = {
  businessTransactionId: "txn-release-path-1",
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
      decisionId: "decision-release-1",
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

/**
 * Wires the gateway the way production does: the gateway verifies, then hands
 * the release to an execution-control service. That service runs the real
 * createReleaseVerifier, which is the single nonce consumption on this path.
 */
function productionLikeGateway(
  publicKey: ReturnType<typeof generateKeyPairSync>["publicKey"],
  nonceStore: MemoryNonceStore,
  connector: CountingConnector,
): ExecutionGateway {
  const releaseVerifier = createReleaseVerifier(nonceStore, {
    getPublicKey: async () => publicKey,
  } as never);

  return new ExecutionGateway({
    // Legacy fixture: predates fail-closed policy binding. The nonce path
    // under test does not depend on policy binding.
    allowUnverifiedPolicy: true,
    publicKey,
    nonceStore,
    executionControl: {
      service: {
        async execute(release) {
          await releaseVerifier(release);
          return connector.execute({
            transaction: release.executableContent as ExecutableContent,
            authorization: release.authorization,
            verification: {} as never,
          });
        },
      },
      route: () => "connector-a",
    },
  });
}

describe("production nonce path: gateway plus release verifier", () => {
  it("releases an authorization once and refuses a second release of the same nonce", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const authorization = await sign(privateKey);
    const nonceStore = new MemoryNonceStore();
    const connector = new CountingConnector();
    const gateway = productionLikeGateway(publicKey, nonceStore, connector);

    const first = await gateway.execute(request(authorization));
    expect(first.success).toBe(true);
    expect(connector.calls).toBe(1);

    await expect(
      gateway.execute(request(authorization)),
    ).rejects.toBeInstanceOf(NonceAlreadyConsumedError);
    expect(connector.calls).toBe(1);
  });

  it("the release verifier refuses a release whose decision is not APPROVED, and leaves the nonce unrecorded", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const authorization = await sign(privateKey, "DECLINED");
    const nonceStore = new MemoryNonceStore();

    // The gateway would refuse this request first, so call the release
    // verifier directly to test its own decision check.
    const releaseVerifier = createReleaseVerifier(nonceStore, {
      getPublicKey: async () => publicKey,
    } as never);

    await expect(
      releaseVerifier({
        authorization,
        executableContent: CONTENT,
        verifiedTransaction: {
          authorizationVerified: true,
          executableContentVerified: true,
          replayCheckPassed: true,
        },
        executionTimestamp: new Date().toISOString(),
        approvals: [],
      } as never),
    ).rejects.toThrow("decision is not APPROVED");

    // The decision check runs before the nonce is consumed, so the nonce is still unseen.
    const stillUnseen = await nonceStore.checkAndRecord(
      authorization.payload.nonce,
      authorization.payload.expiresAt,
    );
    expect(stillUnseen).toBe(true);
  });
});
