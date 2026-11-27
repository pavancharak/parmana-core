import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AuthorizationSigner,
  CryptoBootstrap,
  TrustRecordHasher,
} from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { ExecutionRequest } from "@parmana/execution-system";
import type {
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

import type { Connector } from "../../src/index.js";
import { ExecutionGateway } from "../../src/index.js";

/**
 * R5, at the gateway. The release decision and the signal-freshness determination
 * are separate. A missing signal hash, a hash mismatch, and verifier divergence all
 * refuse the release, but they are different determinations, and signalCheck says
 * which one happened.
 */

const crypto = CryptoBootstrap.create();
const signalsHasher = new TrustRecordHasher(crypto);

const CONTENT: ExecutableContent = {
  businessTransactionId: "txn-determination-1",
  action: "TransferFunds",
  target: "account/12345",
  parameters: { amount: 100 },
};

const ORIGINAL_SIGNALS: PolicySignals = { vendorStatus: "kyc_verified" };
const CHANGED_SIGNALS: PolicySignals = { vendorStatus: "blocked" };

const DRIFT: SignalStateViolation = {
  signalKey: "vendorStatus",
  declaredValue: "kyc_verified",
  actualValue: "blocked",
};

class RecordingConnector implements Connector {
  async execute(): Promise<ExecutionResult> {
    return {
      businessTransactionId: CONTENT.businessTransactionId,
      action: CONTENT.action,
      target: CONTENT.target,
      parameters: CONTENT.parameters,
      success: true,
      executedAt: new Date(),
      metadata: {},
    };
  }
}

class FixedVerifier implements SignalStateVerifier {
  constructor(private readonly violations: readonly SignalStateViolation[]) {}

  async findViolations(
    _request: SignalStateVerificationRequest,
    _signals: PolicySignals,
  ): Promise<readonly SignalStateViolation[]> {
    return this.violations;
  }
}

// One keypair per test, so the gateway's publicKey matches the signature.
async function fixture(signalsHash: string | undefined) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const authorization = await new AuthorizationSigner(crypto).sign(
    {
      decisionId: "decision-1",
      decisionOutcome: "APPROVED",
      businessTransactionId: CONTENT.businessTransactionId,
      policyName: "policy-a",
      policyVersion: "1.0.0",
      ...(signalsHash !== undefined && { signalsHash }),
      executableContent: CONTENT,
    },
    privateKey,
    "key-1",
    60,
  );
  return { publicKey, authorization };
}

function request(
  authorization: SignedExecutionAuthorization,
  signals: PolicySignals,
): ExecutionRequest {
  return {
    businessTransactionId: CONTENT.businessTransactionId,
    action: CONTENT.action,
    target: CONTENT.target,
    parameters: CONTENT.parameters,
    signals,
    authorization,
  };
}

async function verify(
  signalsHash: string | undefined,
  requestSignals: PolicySignals,
  verifier: SignalStateVerifier | undefined,
) {
  const { publicKey, authorization } = await fixture(signalsHash);
  const gateway = new ExecutionGateway({
    allowUnverifiedPolicy: true,
    publicKey,
    nonceStore: new MemoryNonceStore(),
    connector: new RecordingConnector(),
    ...(verifier !== undefined
      ? { signalStateVerifier: verifier }
      : { allowUnverifiedSignals: true }),
  });
  const { result } = await gateway.verify(
    request(authorization, requestSignals),
  );
  return result;
}

describe("ExecutionGateway signal check determination (R5)", () => {
  it("reports passed when the hash matches and the verifier finds no divergence", async () => {
    const hash = await signalsHasher.hash(ORIGINAL_SIGNALS);
    const result = await verify(hash, ORIGINAL_SIGNALS, new FixedVerifier([]));

    expect(result.valid).toBe(true);
    expect(result.signalCheck).toEqual({ status: "passed" });
  });

  it("reports refuted with hash_mismatch when the request's signals no longer match the hash", async () => {
    const hash = await signalsHasher.hash(ORIGINAL_SIGNALS);
    const result = await verify(hash, CHANGED_SIGNALS, new FixedVerifier([]));

    expect(result.valid).toBe(false);
    expect(result.signalCheck).toEqual({
      status: "refuted",
      reason: "hash_mismatch",
    });
  });

  it("reports refuted with verifier_divergence when the hash matches but the verifier finds drift", async () => {
    const hash = await signalsHasher.hash(ORIGINAL_SIGNALS);
    const result = await verify(
      hash,
      ORIGINAL_SIGNALS,
      new FixedVerifier([DRIFT]),
    );

    expect(result.valid).toBe(false);
    expect(result.signalCheck).toEqual({
      status: "refuted",
      reason: "verifier_divergence",
    });
  });

  it("reports not_run with no_signals_hash, not refuted, when the authorization has no hash", async () => {
    const result = await verify(
      undefined,
      ORIGINAL_SIGNALS,
      new FixedVerifier([]),
    );

    expect(result.valid).toBe(false);
    expect(result.checks.signalsStillCurrent).toBe(false);
    expect(result.signalCheck).toEqual({
      status: "not_run",
      reason: "no_signals_hash",
    });
  });

  it("keeps no_signals_hash distinct from a hash mismatch on the same request", async () => {
    const hash = await signalsHasher.hash(ORIGINAL_SIGNALS);
    const absent = await verify(
      undefined,
      CHANGED_SIGNALS,
      new FixedVerifier([]),
    );
    const mismatched = await verify(
      hash,
      CHANGED_SIGNALS,
      new FixedVerifier([]),
    );

    expect(absent.signalCheck?.status).toBe("not_run");
    expect(mismatched.signalCheck?.status).toBe("refuted");
    expect(absent.signalCheck?.reason).not.toBe(mismatched.signalCheck?.reason);
  });

  it("reports not_run with verifier_not_consulted when only the test opt-out is set", async () => {
    const hash = await signalsHasher.hash(ORIGINAL_SIGNALS);
    const result = await verify(hash, ORIGINAL_SIGNALS, undefined);

    expect(result.signalCheck).toEqual({
      status: "not_run",
      reason: "verifier_not_consulted",
    });
    expect(result.checks.signalsStillCurrent).toBeUndefined();
  });
});
