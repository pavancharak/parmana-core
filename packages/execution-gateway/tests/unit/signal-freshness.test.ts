import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationSigner,
  CryptoBootstrap,
  TrustRecordHasher,
} from "@parmana/crypto";

import { MemoryNonceStore } from "@parmana/envelope-verifier";

import type {
  PolicySignals,
  SignalStateVerificationRequest,
  SignalStateVerifier,
  SignalStateViolation,
} from "@parmana/policy";

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
const signalsHasher = new TrustRecordHasher(crypto);

function generateKeyPair() {
  return generateKeyPairSync("ed25519");
}

const SAMPLE_EXECUTABLE_CONTENT: ExecutableContent = {
  businessTransactionId: "txn-1",
  action: "TransferFunds",
  target: "account/12345",
  parameters: { amount: 100 },
};

const ORIGINAL_SIGNALS: PolicySignals = {
  vendorStatus: "kyc_verified",
  riskScore: 10,
};

const CHANGED_SIGNALS: PolicySignals = {
  vendorStatus: "kyc_verified",
  riskScore: 95,
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
 * Fixed-response SignalStateVerifier test double: always returns the
 * violations it was constructed with, regardless of what it's asked to
 * verify. Sufficient for exercising ExecutionGateway's handling of the
 * verifier's result, without needing a real external-state fetch.
 */
class FixedSignalStateVerifier implements SignalStateVerifier {
  constructor(private readonly violations: readonly SignalStateViolation[]) {}

  async findViolations(
    _request: SignalStateVerificationRequest,
    _signals: PolicySignals,
  ): Promise<readonly SignalStateViolation[]> {
    return this.violations;
  }
}

const DRIFT_VIOLATION: SignalStateViolation = {
  signalKey: "vendorStatus",
  declaredValue: "kyc_verified",
  actualValue: "blocked",
};

async function signAuthorization(
  privateKey: ReturnType<typeof generateKeyPair>["privateKey"],
  signalsHash: string | undefined,
): Promise<SignedExecutionAuthorization> {
  const signer = new AuthorizationSigner(crypto);

  return signer.sign(
    {
      decisionId: "decision-1",
      decisionOutcome: "APPROVED",
      businessTransactionId: SAMPLE_EXECUTABLE_CONTENT.businessTransactionId,
      policyName: "policy-a",
      policyVersion: "1.0.0",
      ...(signalsHash !== undefined && { signalsHash }),
      executableContent: SAMPLE_EXECUTABLE_CONTENT,
    },
    privateKey,
    "key-1",
    60,
  );
}

function buildRequest(
  authorization: SignedExecutionAuthorization,
  signals?: PolicySignals,
): ExecutionRequest {
  return {
    businessTransactionId: SAMPLE_EXECUTABLE_CONTENT.businessTransactionId,
    action: SAMPLE_EXECUTABLE_CONTENT.action,
    target: SAMPLE_EXECUTABLE_CONTENT.target,
    parameters: SAMPLE_EXECUTABLE_CONTENT.parameters,
    ...(signals !== undefined && { signals }),
    authorization,
  };
}

describe("ExecutionGateway signal-freshness check (G-31)", () => {
  it("passes and reports signalsStillCurrent: true when signals are unchanged and the verifier finds no drift", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const originalHash = await signalsHasher.hash(ORIGINAL_SIGNALS);
    const signed = await signAuthorization(privateKey, originalHash);

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      signalStateVerifier: new FixedSignalStateVerifier([]),
      connector: new RecordingConnector(),
    });

    const { result } = await gateway.verify(
      buildRequest(signed, ORIGINAL_SIGNALS),
    );

    expect(result.valid).toBe(true);
    expect(result.checks.signalsStillCurrent).toBe(true);
    expect(result.signalDivergence).toBeUndefined();
  });

  it('asks the verifier with stage "release", so a single use approval consumed at authorization is not consumed again', async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const originalHash = await signalsHasher.hash(ORIGINAL_SIGNALS);
    const signed = await signAuthorization(privateKey, originalHash);
    const verifier = new FixedSignalStateVerifier([]);
    const spy = vi.spyOn(verifier, "findViolations");

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      signalStateVerifier: verifier,
      connector: new RecordingConnector(),
    });

    await gateway.verify(buildRequest(signed, ORIGINAL_SIGNALS));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual({
      action: SAMPLE_EXECUTABLE_CONTENT.action,
      businessTransactionId: SAMPLE_EXECUTABLE_CONTENT.businessTransactionId,
      intentParameters: SAMPLE_EXECUTABLE_CONTENT.parameters,
      intentTarget: SAMPLE_EXECUTABLE_CONTENT.target,
      stage: "release",
    });
  });

  it("fails with signalsStillCurrent: false and named divergence when the verifier reports drift", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const originalHash = await signalsHasher.hash(ORIGINAL_SIGNALS);
    const signed = await signAuthorization(privateKey, originalHash);

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      signalStateVerifier: new FixedSignalStateVerifier([DRIFT_VIOLATION]),
      connector: new RecordingConnector(),
    });

    const { result } = await gateway.verify(
      buildRequest(signed, ORIGINAL_SIGNALS),
    );

    expect(result.valid).toBe(false);
    expect(result.checks.signalsStillCurrent).toBe(false);
    expect(result.signalDivergence).toEqual([DRIFT_VIOLATION]);
    expect(result.checks.nonceUnseen).toBe(false);
  });

  it("execute() throws naming the signal divergence", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const originalHash = await signalsHasher.hash(ORIGINAL_SIGNALS);
    const signed = await signAuthorization(privateKey, originalHash);

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      signalStateVerifier: new FixedSignalStateVerifier([DRIFT_VIOLATION]),
      connector: new RecordingConnector(),
    });

    await expect(
      gateway.execute(buildRequest(signed, ORIGINAL_SIGNALS)),
    ).rejects.toThrow(/Signal\(s\) diverged from verified state/);
  });

  it("fails with signalsStillCurrent: false and a named hash mismatch when the request's signals no longer hash-match the authorization", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const originalHash = await signalsHasher.hash(ORIGINAL_SIGNALS);
    const signed = await signAuthorization(privateKey, originalHash);

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      // Never consulted: the hash check fails first.
      signalStateVerifier: new FixedSignalStateVerifier([]),
      connector: new RecordingConnector(),
    });

    const { result } = await gateway.verify(
      buildRequest(signed, CHANGED_SIGNALS),
    );

    expect(result.valid).toBe(false);
    expect(result.checks.signalsStillCurrent).toBe(false);
    expect(result.signalsHashMismatch?.expected).toBe(originalHash);
    expect(result.signalDivergence).toBeUndefined();
  });

  it("skips the check (signalsStillCurrent absent, not false) when no signalStateVerifier is wired", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const originalHash = await signalsHasher.hash(ORIGINAL_SIGNALS);
    const signed = await signAuthorization(privateKey, originalHash);

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      connector: new RecordingConnector(),
    });

    const { result } = await gateway.verify(
      buildRequest(signed, ORIGINAL_SIGNALS),
    );

    expect(result.valid).toBe(true);
    expect(result.checks.signalsStillCurrent).toBeUndefined();
  });

  it("skips the check (not fails) when the authorization carries no signalsHash", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey, undefined);

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      signalStateVerifier: new FixedSignalStateVerifier([DRIFT_VIOLATION]),
      connector: new RecordingConnector(),
    });

    const { result } = await gateway.verify(
      buildRequest(signed, ORIGINAL_SIGNALS),
    );

    expect(result.valid).toBe(true);
    expect(result.checks.signalsStillCurrent).toBeUndefined();
  });

  it("fails with a named hash mismatch when the authorization was signed over signals and the request omits them", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const originalHash = await signalsHasher.hash(ORIGINAL_SIGNALS);
    const signed = await signAuthorization(privateKey, originalHash);

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      signalStateVerifier: new FixedSignalStateVerifier([]),
      connector: new RecordingConnector(),
    });

    const { result } = await gateway.verify(buildRequest(signed));

    expect(result.valid).toBe(false);
    expect(result.checks.signalsStillCurrent).toBe(false);
    expect(result.signalsHashMismatch?.expected).toBe(originalHash);
    expect(result.signalsHashMismatch?.actual).toBe(
      await signalsHasher.hash({}),
    );
  });

  it("checks a request without signals as {} when the authorization was signed over no signals", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const emptyHash = await signalsHasher.hash({});
    const signed = await signAuthorization(privateKey, emptyHash);

    const passing = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      signalStateVerifier: new FixedSignalStateVerifier([]),
      connector: new RecordingConnector(),
    });

    const { result: passed } = await passing.verify(buildRequest(signed));

    expect(passed.valid).toBe(true);
    expect(passed.checks.signalsStillCurrent).toBe(true);

    const drifting = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding.
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      signalStateVerifier: new FixedSignalStateVerifier([DRIFT_VIOLATION]),
      connector: new RecordingConnector(),
    });

    const { result: failed } = await drifting.verify(buildRequest(signed));

    expect(failed.valid).toBe(false);
    expect(failed.checks.signalsStillCurrent).toBe(false);
  });

  it("a nonce-replay-only failure is still correctly classified when signalsStillCurrent was skipped", async () => {
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
    // signalsStillCurrent) still passes; only nonce consumption fails.
    await expect(gateway.execute(buildRequest(signed))).rejects.toThrow(
      NonceAlreadyConsumedError,
    );
  });
});
