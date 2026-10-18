import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AuthorizationSigner,
  CryptoBootstrap,
  TrustRecordHasher,
} from "@parmana/crypto";

import { MemoryNonceStore } from "@parmana/envelope-verifier";

import type {
  Policy,
  PolicyExecutionVerifier,
  PolicyExecutionViolation,
  PolicyRepository,
} from "@parmana/policy";

import type { ExecutionRequest } from "@parmana/execution-system";

import type {
  ExecutableContent,
  ExecutionResult,
  SignedExecutionAuthorization,
} from "@parmana/shared";

import type { Connector } from "../../src/index.js";
import { ExecutionGateway } from "../../src/index.js";

const crypto = CryptoBootstrap.create();
const hasher = new TrustRecordHasher(crypto);

const CONTENT: ExecutableContent = {
  businessTransactionId: "txn-1",
  action: "TransferFunds",
  target: "account/12345",
  parameters: { amount: 100 },
};

const APPROVED_POLICY: Policy = {
  policyId: "policy-a",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",
};

const EDITED_POLICY: Policy = {
  ...APPROVED_POLICY,
  description: "edited outside the governed approval flow",
};

class CountingConnector implements Connector {
  calls = 0;

  async execute(): Promise<ExecutionResult> {
    this.calls += 1;

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

class MapPolicyRepository implements PolicyRepository {
  constructor(private policy: Policy | undefined) {}

  async load(name: string, version: string): Promise<Policy> {
    if (this.policy === undefined) {
      throw new Error(`Policy not found: ${name}@${version}`);
    }

    return this.policy;
  }

  async save(_name: string, _version: string, content: Policy): Promise<void> {
    this.policy = content;
  }
}

/**
 * Approval verifier double that models a real approval record: the
 * verifier passes only when a record exists AND its approved hash equals
 * the live hash the gateway hands it.
 */
class RecordApprovalVerifier implements PolicyExecutionVerifier {
  seen: string[] = [];

  constructor(private readonly approvedHash: string | undefined) {}

  async verify(
    policyName: string,
    policyVersion: string,
    liveHash: string,
  ): Promise<PolicyExecutionViolation | undefined> {
    this.seen.push(liveHash);

    if (this.approvedHash === undefined) {
      return {
        reason: `policy "${policyName}"@"${policyVersion}" has no PolicyChangeApprovalRecord`,
      };
    }

    if (this.approvedHash !== liveHash) {
      return {
        reason: "live content does not match approval record contentHashAfter",
      };
    }

    return undefined;
  }
}

function keys() {
  return generateKeyPairSync("ed25519");
}

async function sign(
  privateKey: ReturnType<typeof keys>["privateKey"],
  policyContentHash: string | undefined,
): Promise<SignedExecutionAuthorization> {
  return new AuthorizationSigner(crypto).sign(
    {
      decisionId: "decision-1",
      decisionOutcome: "APPROVED",
      businessTransactionId: CONTENT.businessTransactionId,
      policyName: "policy-a",
      policyVersion: "1.0.0",
      ...(policyContentHash !== undefined && { policyContentHash }),
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

async function setup(options: {
  livePolicy: Policy | undefined;
  approvedHash: string | undefined;
  signedHash: string | undefined;
}) {
  const { privateKey, publicKey } = keys();
  const connector = new CountingConnector();
  const verifier = new RecordApprovalVerifier(options.approvedHash);
  const nonceStore = new MemoryNonceStore();

  const gateway = new ExecutionGateway({
    publicKey,
    nonceStore,
    policyRepository: new MapPolicyRepository(options.livePolicy),
    policyApprovalVerifier: verifier,
    connector,
  });

  const authorization = await sign(privateKey, options.signedHash);

  return { gateway, connector, verifier, nonceStore, authorization, publicKey };
}

describe("ExecutionGateway fails closed on policy binding", () => {
  it("releases only when approved hash, signed hash and live hash all agree", async () => {
    const h = await hasher.hash(APPROVED_POLICY);

    const { gateway, connector, verifier, authorization } = await setup({
      livePolicy: APPROVED_POLICY,
      approvedHash: h,
      signedHash: h,
    });

    const result = await gateway.execute(request(authorization));

    expect(result.success).toBe(true);
    expect(connector.calls).toBe(1);
    expect(verifier.seen).toEqual([h]);
  });

  it("refuses to construct without a policyRepository and approval verifier", () => {
    const { publicKey } = keys();

    expect(
      () =>
        new ExecutionGateway({
          publicKey,
          nonceStore: new MemoryNonceStore(),
          connector: new CountingConnector(),
        }),
    ).toThrow(/fails closed on policy binding/);

    expect(
      () =>
        new ExecutionGateway({
          publicKey,
          nonceStore: new MemoryNonceStore(),
          policyRepository: new MapPolicyRepository(APPROVED_POLICY),
          connector: new CountingConnector(),
        }),
    ).toThrow(/fails closed on policy binding/);
  });

  it("rejects an old authorization that carries no policyContentHash", async () => {
    const h = await hasher.hash(APPROVED_POLICY);

    const { gateway, connector, authorization } = await setup({
      livePolicy: APPROVED_POLICY,
      approvedHash: h,
      signedHash: undefined,
    });

    await expect(gateway.execute(request(authorization))).rejects.toThrow(
      /policyStillCurrent/,
    );

    expect(connector.calls).toBe(0);
  });

  it("rejects when the live policy was edited after authorization", async () => {
    const approved = await hasher.hash(APPROVED_POLICY);

    const { gateway, connector, authorization } = await setup({
      livePolicy: EDITED_POLICY,
      approvedHash: approved,
      signedHash: approved,
    });

    await expect(gateway.execute(request(authorization))).rejects.toThrow(
      /policyContentHash mismatch/,
    );

    expect(connector.calls).toBe(0);
  });

  it("rejects when the policy has no approval record", async () => {
    const h = await hasher.hash(APPROVED_POLICY);

    const { gateway, connector, authorization } = await setup({
      livePolicy: APPROVED_POLICY,
      approvedHash: undefined,
      signedHash: h,
    });

    await expect(gateway.execute(request(authorization))).rejects.toThrow(
      /policyGovernanceVerified.*no PolicyChangeApprovalRecord/s,
    );

    expect(connector.calls).toBe(0);
  });

  it("rejects when the approval record's hash differs from the live and signed hash", async () => {
    const live = await hasher.hash(APPROVED_POLICY);
    const staleApproved = await hasher.hash(EDITED_POLICY);

    const { gateway, connector, authorization } = await setup({
      livePolicy: APPROVED_POLICY,
      approvedHash: staleApproved,
      signedHash: live,
    });

    await expect(gateway.execute(request(authorization))).rejects.toThrow(
      /does not match approval record contentHashAfter/,
    );

    expect(connector.calls).toBe(0);
  });

  it("rejects when the approval verifier itself errors", async () => {
    const h = await hasher.hash(APPROVED_POLICY);
    const { privateKey, publicKey } = keys();
    const connector = new CountingConnector();

    const gateway = new ExecutionGateway({
      publicKey,
      nonceStore: new MemoryNonceStore(),
      policyRepository: new MapPolicyRepository(APPROVED_POLICY),
      policyApprovalVerifier: {
        async verify() {
          throw new Error("approval store unreachable");
        },
      },
      connector,
    });

    const authorization = await sign(privateKey, h);

    await expect(gateway.execute(request(authorization))).rejects.toThrow(
      /approval store unreachable/,
    );

    expect(connector.calls).toBe(0);
  });

  it("rejects when the policy no longer exists", async () => {
    const h = await hasher.hash(APPROVED_POLICY);

    const { gateway, connector, authorization } = await setup({
      livePolicy: undefined,
      approvedHash: h,
      signedHash: h,
    });

    await expect(gateway.execute(request(authorization))).rejects.toThrow(
      /policy not found/,
    );

    expect(connector.calls).toBe(0);
  });

  it("does not burn the nonce when the policy binding fails", async () => {
    const h = await hasher.hash(APPROVED_POLICY);
    const { privateKey, publicKey } = keys();
    const nonceStore = new MemoryNonceStore();
    const connector = new CountingConnector();
    const authorization = await sign(privateKey, h);

    const broken = new ExecutionGateway({
      publicKey,
      nonceStore,
      policyRepository: new MapPolicyRepository(APPROVED_POLICY),
      policyApprovalVerifier: new RecordApprovalVerifier(undefined),
      connector,
    });

    await expect(broken.execute(request(authorization))).rejects.toThrow();

    const fixed = new ExecutionGateway({
      publicKey,
      nonceStore,
      policyRepository: new MapPolicyRepository(APPROVED_POLICY),
      policyApprovalVerifier: new RecordApprovalVerifier(h),
      connector,
    });

    const result = await fixed.execute(request(authorization));

    expect(result.success).toBe(true);
    expect(connector.calls).toBe(1);
  });

  it("only skips policy binding under the explicit legacy opt out", async () => {
    const { privateKey, publicKey } = keys();
    const connector = new CountingConnector();

    const legacy = new ExecutionGateway({
      publicKey,
      nonceStore: new MemoryNonceStore(),
      allowUnverifiedPolicy: true,
      connector,
    });

    const authorization = await sign(privateKey, undefined);

    const result = await legacy.execute(request(authorization));

    expect(result.success).toBe(true);
    expect(connector.calls).toBe(1);
  });
});
