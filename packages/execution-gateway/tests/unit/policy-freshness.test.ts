import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AuthorizationSigner,
  CryptoBootstrap,
  TrustRecordHasher,
} from "@parmana/crypto";

import { MemoryNonceStore } from "@parmana/envelope-verifier";

import type { Policy, PolicyRepository } from "@parmana/policy";

import type { ExecutionRequest } from "@parmana/execution-system";

import {
  NonceAlreadyConsumedError,
  type ExecutableContent,
  type ExecutionResult,
  type SignedExecutionAuthorization,
} from "@parmana/shared";

import type { Connector } from "../../src/index.js";
import { ExecutionGateway } from "../../src/index.js";

const crypto = CryptoBootstrap.create();
const policyContentHasher = new TrustRecordHasher(crypto);

function generateKeyPair() {
  return generateKeyPairSync("ed25519");
}

const SAMPLE_EXECUTABLE_CONTENT: ExecutableContent = {
  businessTransactionId: "txn-1",
  action: "TransferFunds",
  target: "account/12345",
  parameters: { amount: 100 },
};

class RecordingConnector implements Connector {
  async execute(): Promise<ExecutionResult> {
    return {
      businessTransactionId: SAMPLE_EXECUTABLE_CONTENT.businessTransactionId,
      action: SAMPLE_EXECUTABLE_CONTENT.action,
      target: SAMPLE_EXECUTABLE_CONTENT.target,
      parameters: SAMPLE_EXECUTABLE_CONTENT.parameters,
      success: true,
      executedAt: new Date(),
      metadata: {},
    };
  }
}

/**
 * In-memory PolicyRepository test double, keyed by "name@version".
 */
class MapPolicyRepository implements PolicyRepository {
  constructor(private readonly policies: Map<string, Policy>) {}

  async load(name: string, version: string): Promise<Policy> {
    const policy = this.policies.get(`${name}@${version}`);

    if (policy === undefined) {
      throw new Error(`Policy not found: ${name}@${version}`);
    }

    return policy;
  }

  async save(name: string, version: string, content: Policy): Promise<void> {
    this.policies.set(`${name}@${version}`, content);
  }
}

const ORIGINAL_POLICY: Policy = {
  policyId: "policy-a",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",
};

const CHANGED_POLICY: Policy = {
  policyId: "policy-a",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",
  description: "spending limit reduced",
};

async function signAuthorization(
  privateKey: ReturnType<typeof generateKeyPair>["privateKey"],
  policyContentHash: string | undefined,
): Promise<SignedExecutionAuthorization> {
  const signer = new AuthorizationSigner(crypto);

  return signer.sign(
    {
      decisionId: "decision-1",
      decisionOutcome: "APPROVED",
      businessTransactionId: SAMPLE_EXECUTABLE_CONTENT.businessTransactionId,
      policyName: "policy-a",
      policyVersion: "1.0.0",
      ...(policyContentHash !== undefined && { policyContentHash }),
      executableContent: SAMPLE_EXECUTABLE_CONTENT,
    },
    privateKey,
    "key-1",
    60,
  );
}

function buildRequest(
  authorization: SignedExecutionAuthorization,
): ExecutionRequest {
  return {
    businessTransactionId: SAMPLE_EXECUTABLE_CONTENT.businessTransactionId,
    action: SAMPLE_EXECUTABLE_CONTENT.action,
    target: SAMPLE_EXECUTABLE_CONTENT.target,
    parameters: SAMPLE_EXECUTABLE_CONTENT.parameters,
    authorization,
  };
}

describe("ExecutionGateway policy-freshness check (Gap 1B)", () => {
  it("passes and reports policyStillCurrent: true when policy content is unchanged", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const originalHash = await policyContentHasher.hash(ORIGINAL_POLICY);
    const signed = await signAuthorization(privateKey, originalHash);

    const policyRepository = new MapPolicyRepository(
      new Map([["policy-a@1.0.0", ORIGINAL_POLICY]]),
    );

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      policyRepository,
      connector: new RecordingConnector(),
    });

    const { result } = await gateway.verify(buildRequest(signed));

    expect(result.valid).toBe(true);
    expect(result.checks.policyStillCurrent).toBe(true);
    expect(result.policyContentMismatch).toBeUndefined();
  });

  it("fails with policyStillCurrent: false and a named mismatch when the policy content has changed since signing", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const originalHash = await policyContentHasher.hash(ORIGINAL_POLICY);
    const signed = await signAuthorization(privateKey, originalHash);

    // The policy has since been changed in place (governance permits
    // in-place content edits to an existing version string).
    const policyRepository = new MapPolicyRepository(
      new Map([["policy-a@1.0.0", CHANGED_POLICY]]),
    );

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      policyRepository,
      connector: new RecordingConnector(),
    });

    const { result } = await gateway.verify(buildRequest(signed));

    expect(result.valid).toBe(false);
    expect(result.checks.policyStillCurrent).toBe(false);
    expect(result.policyContentMismatch?.expected).toBe(originalHash);
    expect(result.checks.nonceUnseen).toBe(false);
  });

  it("execute() throws naming the policy content mismatch", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const originalHash = await policyContentHasher.hash(ORIGINAL_POLICY);
    const signed = await signAuthorization(privateKey, originalHash);

    const policyRepository = new MapPolicyRepository(
      new Map([["policy-a@1.0.0", CHANGED_POLICY]]),
    );

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      policyRepository,
      connector: new RecordingConnector(),
    });

    await expect(gateway.execute(buildRequest(signed))).rejects.toThrow(
      /policyContentHash mismatch/,
    );
  });

  it("fails with policyStillCurrent: false when the policy no longer exists at that name/version", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const originalHash = await policyContentHasher.hash(ORIGINAL_POLICY);
    const signed = await signAuthorization(privateKey, originalHash);

    const policyRepository = new MapPolicyRepository(new Map());

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      policyRepository,
      connector: new RecordingConnector(),
    });

    const { result } = await gateway.verify(buildRequest(signed));

    expect(result.valid).toBe(false);
    expect(result.checks.policyStillCurrent).toBe(false);
  });

  it("skips the check (policyStillCurrent absent, not false) when no policyRepository is wired", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const originalHash = await policyContentHasher.hash(ORIGINAL_POLICY);
    const signed = await signAuthorization(privateKey, originalHash);

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      connector: new RecordingConnector(),
    });

    const { result } = await gateway.verify(buildRequest(signed));

    expect(result.valid).toBe(true);
    expect(result.checks.policyStillCurrent).toBeUndefined();
  });

  it("skips the check (not fails) when the authorization carries no policyContentHash", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey, undefined);

    const policyRepository = new MapPolicyRepository(
      new Map([["policy-a@1.0.0", CHANGED_POLICY]]),
    );

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      policyRepository,
      connector: new RecordingConnector(),
    });

    const { result } = await gateway.verify(buildRequest(signed));

    expect(result.valid).toBe(true);
    expect(result.checks.policyStillCurrent).toBeUndefined();
  });

  it("a nonce-replay-only failure is still correctly classified when policyStillCurrent was skipped", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey, undefined);

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      connector: new RecordingConnector(),
    });

    await gateway.execute(buildRequest(signed));

    // Second execution of the exact same authorization: every
    // side-effect-free check (including the skipped/undefined
    // policyStillCurrent) still passes; only nonce consumption fails.
    await expect(gateway.execute(buildRequest(signed))).rejects.toThrow(
      NonceAlreadyConsumedError,
    );
  });
});
