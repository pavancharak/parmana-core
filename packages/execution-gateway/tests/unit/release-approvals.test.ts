import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AuthorizationSigner,
  CryptoBootstrap,
  TrustRecordHasher,
} from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type {
  ExecutionControl,
  ExecutionRelease,
} from "@parmana/execution-control";
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

import { ExecutionGateway } from "../../src/index.js";

/**
 * The approvals the Gateway hands to Execution Control with a release
 * (ADR-0013): read from the request's signals, and only once those
 * signals were checked against the authorization's signed signalsHash.
 */

const crypto = CryptoBootstrap.create();
const signalsHasher = new TrustRecordHasher(crypto);

const CONTENT: ExecutableContent = {
  businessTransactionId: "txn-approvals",
  action: "erp:create-invoice",
  target: "customer-42",
  parameters: { amount: 1200 },
};

const SIGNALS: PolicySignals = {
  managerApproval: {
    payload: {
      version: 1,
      approvalId: "ap-1",
      issuer: { approverId: "manager-x", keyId: "manager-x-key-1" },
      capability: "erp:create-invoice",
    },
    signature: { algorithm: "ed25519", value: "sig" },
  },
  riskScore: 10,
  note: { payload: { approvalId: "not-an-approval" } },
} as unknown as PolicySignals;

class FixedSignalStateVerifier implements SignalStateVerifier {
  constructor(private readonly violations: readonly SignalStateViolation[]) {}

  async findViolations(
    _request: SignalStateVerificationRequest,
    _signals: PolicySignals,
  ): Promise<readonly SignalStateViolation[]> {
    return this.violations;
  }
}

class RecordingExecutionControl implements ExecutionControl {
  releases: ExecutionRelease[] = [];
  authentications: unknown[] = [];

  async execute(
    release: ExecutionRelease,
    authentication?: unknown,
  ): Promise<ExecutionResult> {
    this.releases.push(release);
    this.authentications.push(authentication);

    return {
      ...CONTENT,
      success: true,
      executedAt: new Date(),
      metadata: {},
    };
  }
}

async function run(options: {
  signalsHash: "match" | "none";
  signals?: PolicySignals;
  verifier?: SignalStateVerifier;
  mint?: (authorizationId: string) => unknown;
  control?: RecordingExecutionControl;
}): Promise<ExecutionRelease> {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const control = options.control ?? new RecordingExecutionControl();
  const authorization: SignedExecutionAuthorization =
    await new AuthorizationSigner(crypto).sign(
      {
        decisionId: "decision-1",
        decisionOutcome: "APPROVED",
        businessTransactionId: CONTENT.businessTransactionId,
        policyName: "erp-invoice",
        policyVersion: "1.0.0",
        ...(options.signalsHash === "match"
          ? { signalsHash: await signalsHasher.hash(options.signals ?? {}) }
          : {}),
        executableContent: CONTENT,
      },
      privateKey,
      "key-1",
      60,
    );

  const gateway = new ExecutionGateway({
    // Legacy fixture: predates fail-closed policy binding.
    allowUnverifiedPolicy: true,
    publicKey,
    nonceStore: new MemoryNonceStore(),
    ...(options.verifier !== undefined
      ? { signalStateVerifier: options.verifier }
      : {}),
    executionControl: {
      service: control,
      gatewayAuthentication: "test",
      ...(options.mint !== undefined
        ? { mintGatewayAuthentication: options.mint }
        : {}),
      route: () => "ext-erp:create-invoice",
    },
  });

  const request: ExecutionRequest = {
    ...CONTENT,
    ...(options.signals !== undefined ? { signals: options.signals } : {}),
    authorization,
  };

  await gateway.execute(request);

  expect(control.releases).toHaveLength(1);
  return control.releases[0]!;
}

describe("ExecutionGateway release approvals", () => {
  it("lists every signed approval among the signals once they match the signed signalsHash", async () => {
    const release = await run({
      signalsHash: "match",
      signals: SIGNALS,
      verifier: new FixedSignalStateVerifier([]),
    });

    expect(release.approvals).toEqual([
      { approverId: "manager-x", keyId: "manager-x-key-1", approvalId: "ap-1" },
    ]);
  });

  it("lists none when the signals were not checked: no signalsHash in the authorization", async () => {
    const release = await run({
      signalsHash: "none",
      signals: SIGNALS,
      verifier: new FixedSignalStateVerifier([]),
    });

    expect(release.approvals).toEqual([]);
  });

  it("lists none when no signal verifier is configured, so nothing checked the signals", async () => {
    const release = await run({ signalsHash: "match", signals: SIGNALS });

    expect(release.approvals).toEqual([]);
  });

  it("lists none for a request with no signals, signed over none", async () => {
    const release = await run({
      signalsHash: "match",
      verifier: new FixedSignalStateVerifier([]),
    });

    expect(release.approvals).toEqual([]);
  });

  it.each([
    ["approverId", { approverId: 7, keyId: "k-1" }],
    ["keyId", { approverId: "manager-y", keyId: 7 }],
  ])(
    "skips a value shaped like an approval whose %s is not a string",
    async (_field, issuer) => {
      const signals = {
        ...SIGNALS,
        malformed: { payload: { approvalId: "ap-2", issuer } },
      } as unknown as PolicySignals;

      const release = await run({
        signalsHash: "match",
        signals,
        verifier: new FixedSignalStateVerifier([]),
      });

      expect(release.approvals).toEqual([
        {
          approverId: "manager-x",
          keyId: "manager-x-key-1",
          approvalId: "ap-1",
        },
      ]);
    },
  );

  it("presents a gateway token minted for this authorization, instead of the static one", async () => {
    const control = new RecordingExecutionControl();
    const minted: string[] = [];
    const release = await run({
      signalsHash: "none",
      control,
      mint: (authorizationId) => {
        minted.push(authorizationId);
        return `token-for-${authorizationId}`;
      },
    });

    expect(minted).toEqual([release.authorization.payload.authorizationId]);
    expect(control.authentications).toEqual([
      `token-for-${release.authorization.payload.authorizationId}`,
    ]);
    expect(release.verifiedTransaction).toEqual({
      authorizationVerified: true,
      executableContentVerified: true,
      replayCheckPassed: true,
    });
  });

  it("presents the static gateway token when none is minted", async () => {
    const control = new RecordingExecutionControl();
    await run({ signalsHash: "none", control });
    expect(control.authentications).toEqual(["test"]);
  });
});
