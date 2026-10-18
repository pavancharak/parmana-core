import { generateKeyPairSync, type KeyObject } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AuthorizationSigner,
  CryptoBootstrap,
  TrustRecordHasher,
  type KeyExpiryStore,
  type KeyProvider,
} from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { ExecutionRequest } from "@parmana/execution-system";
import type {
  Policy,
  PolicyExecutionVerifier,
  PolicyRepository,
  PolicySignals,
  SignalStateVerificationRequest,
  SignalStateVerifier,
  SignalStateViolation,
} from "@parmana/policy";
import type {
  ExecutableContent,
  ExecutionResult,
  SignedExecutionAuthorization,
} from "@parmana/shared";

import type { Connector, ExecutionGatewayOptions } from "../../src/index.js";
import { ExecutionGateway } from "../../src/index.js";

/**
 * Mutation testing found that the Gateway's own options could be dropped
 * without a test failing: maxTtlSeconds, keyProvider and keyExpiryStore
 * were never shown to reach the envelope verifier, the verified policy
 * was never shown to reach the release-time signal check, and an
 * incomplete executionControl or a missing policyRepository alone was
 * never refused in a test. Each is pinned here, in the strict
 * (production) policy binding mode.
 */

const crypto = CryptoBootstrap.create();
const hasher = new TrustRecordHasher(crypto);

const CONTENT: ExecutableContent = {
  businessTransactionId: "txn-wiring",
  action: "TransferFunds",
  target: "account/12345",
  parameters: { amount: 100 },
};

const POLICY: Policy = {
  policyId: "policy-a",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",
};

const SIGNALS = { riskScore: 10 } as unknown as PolicySignals;

class CountingConnector implements Connector {
  calls = 0;

  async execute(): Promise<ExecutionResult> {
    this.calls += 1;
    return { ...CONTENT, success: true, executedAt: new Date(), metadata: {} };
  }
}

const repository: PolicyRepository = {
  async load() {
    return POLICY;
  },
  async save() {},
};

const approvedPolicy: PolicyExecutionVerifier = {
  async verify() {
    return undefined;
  },
};

class RecordingSignalStateVerifier implements SignalStateVerifier {
  requests: SignalStateVerificationRequest[] = [];

  async findViolations(
    request: SignalStateVerificationRequest,
    _signals: PolicySignals,
  ): Promise<readonly SignalStateViolation[]> {
    this.requests.push(request);
    return [];
  }
}

async function authorize(
  privateKey: KeyObject,
  ttlSeconds = 60,
): Promise<SignedExecutionAuthorization> {
  return new AuthorizationSigner(crypto).sign(
    {
      decisionId: "decision-1",
      decisionOutcome: "APPROVED",
      businessTransactionId: CONTENT.businessTransactionId,
      policyName: POLICY.policyId,
      policyVersion: POLICY.policyVersion,
      policyContentHash: await hasher.hash(POLICY),
      signalsHash: await hasher.hash(SIGNALS),
      executableContent: CONTENT,
    },
    privateKey,
    "key-1",
    ttlSeconds,
  );
}

const requestFor = (
  authorization: SignedExecutionAuthorization,
): ExecutionRequest => ({ ...CONTENT, signals: SIGNALS, authorization });

function gatewayWith(
  publicKey: KeyObject,
  options: Partial<ExecutionGatewayOptions> = {},
) {
  const connector = new CountingConnector();
  const gateway = new ExecutionGateway({
    publicKey,
    nonceStore: new MemoryNonceStore(),
    policyRepository: repository,
    policyApprovalVerifier: approvedPolicy,
    connector,
    ...options,
  } as ExecutionGatewayOptions);
  return { gateway, connector };
}

function providerFor(publicKey: KeyObject): KeyProvider {
  return {
    async getPublicKey(keyId: string) {
      if (keyId !== "key-1") throw new Error(`unknown key ${keyId}`);
      return publicKey;
    },
  } as unknown as KeyProvider;
}

describe("ExecutionGateway passes its options on", () => {
  it("maxTtlSeconds: an authorization living longer is refused", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const authorization = await authorize(privateKey, 120);

    const strict = gatewayWith(publicKey, { maxTtlSeconds: 60 });
    await expect(
      strict.gateway.execute(requestFor(authorization)),
    ).rejects.toThrow(/ttlWithinPolicy/);
    expect(strict.connector.calls).toBe(0);

    const loose = gatewayWith(publicKey, { maxTtlSeconds: 120 });
    await expect(
      loose.gateway.execute(requestFor(authorization)),
    ).resolves.toMatchObject({ success: true });
  });

  it("keyProvider: the authorization's keyId is resolved through it", async () => {
    const signer = generateKeyPairSync("ed25519");
    const other = generateKeyPairSync("ed25519");
    const authorization = await authorize(signer.privateKey);

    // The static key is the wrong one; only the provider has the signer's.
    const { gateway, connector } = gatewayWith(other.publicKey, {
      keyProvider: providerFor(signer.publicKey),
    });
    await expect(
      gateway.execute(requestFor(authorization)),
    ).resolves.toMatchObject({ success: true });
    expect(connector.calls).toBe(1);
  });

  it("keyExpiryStore: a revoked key is refused", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const authorization = await authorize(privateKey);
    const revoked: KeyExpiryStore = {
      async get(keyId) {
        return keyId === "key-1" ? { revoked: true } : undefined;
      },
    };

    const { gateway, connector } = gatewayWith(publicKey, {
      keyProvider: providerFor(publicKey),
      keyExpiryStore: revoked,
    });
    await expect(gateway.execute(requestFor(authorization))).rejects.toThrow(
      /keyValid/,
    );
    expect(connector.calls).toBe(0);
  });

  it("the verified policy reaches the release-time signal check", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const verifier = new RecordingSignalStateVerifier();
    const { gateway } = gatewayWith(publicKey, {
      signalStateVerifier: verifier,
    });

    await gateway.execute(requestFor(await authorize(privateKey)));

    expect(verifier.requests).toHaveLength(1);
    expect(verifier.requests[0]).toMatchObject({
      stage: "release",
      policy: POLICY,
    });
  });
});

describe("ExecutionGateway refuses an incomplete setup", () => {
  it("without a policyRepository, even with an approval verifier", () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    expect(
      () =>
        new ExecutionGateway({
          publicKey,
          nonceStore: new MemoryNonceStore(),
          policyApprovalVerifier: approvedPolicy,
          connector: new CountingConnector(),
        }),
    ).toThrow(/fails closed on policy binding/);
  });

  it.each([
    ["no channel", { gatewayIdentity: { present: () => "id" } }],
    ["no gatewayIdentity", { channel: { release: async () => undefined } }],
  ])(
    "executionControl with %s is refused before anything is released",
    async (_label, partial) => {
      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      const gateway = new ExecutionGateway({
        publicKey,
        nonceStore: new MemoryNonceStore(),
        policyRepository: repository,
        policyApprovalVerifier: approvedPolicy,
        executionControl: {
          route: () => "connector",
          ...partial,
        },
      } as unknown as ExecutionGatewayOptions);

      await expect(
        gateway.execute(requestFor(await authorize(privateKey))),
      ).rejects.toThrow("Execution Gateway executionControl is incomplete.");
    },
  );
});
