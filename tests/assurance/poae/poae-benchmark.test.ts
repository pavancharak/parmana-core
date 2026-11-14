/**
 * PoAE benchmark runner (specification: testing/poae/benchmark-spec.md).
 *
 * Runs the tests that map onto existing mechanisms. Each test asserts the
 * expected result of its benchmark ID. The benchmark tests that are not
 * implemented here are listed at the end as "not run", with the reason.
 *
 * Limits, stated so results are not over-read:
 * - XM-01 and XM-02 change the content, so they test the content-hash check.
 *   They do not test a policy limit or an approved vendor list.
 * - EM-01, EM-02 and EM-04 test the record-level correspondence check. They
 *   do not test the connector's outbound request.
 * - The fixtures use the legacy allowUnverifiedPolicy path, so the policy
 *   binding is not exercised here.
 */
import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ArtifactSigner,
  AuthorizationSigner,
  CryptoBootstrap,
  ExecutableContentHasher,
  TrustRecordHasher,
  checkTrustRecordCorrespondenceOffline,
  verifyExecutionTrustRecordOffline,
} from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { ExecutionRequest } from "@parmana/execution-system";
import {
  reconcileExecutionEvidence,
  type ExecutableContent,
  type ExecutionResult,
  type ExecutionTrustRecord,
  type SignedExecutionAuthorization,
} from "@parmana/shared";

import type {
  Connector,
  ConnectorRequest,
} from "../../../packages/execution-gateway/src/index.js";
import { ExecutionGateway } from "../../../packages/execution-gateway/src/index.js";
// Not re-exported from the crypto package root; imported from source, as the gateway is.
import { canonicalExecutionTrustRecord } from "../../../packages/crypto/src/ExecutionTrustRecordCanonicalView.js";
import { SHA256HashProvider } from "../../../packages/crypto/src/providers/hash/SHA256HashProvider.js";
import { Ed25519SignatureProvider } from "../../../packages/crypto/src/providers/signature/Ed25519SignatureProvider.js";

const crypto = CryptoBootstrap.create();
void ExecutableContentHasher;

const CONTENT: ExecutableContent = {
  businessTransactionId: "txn-poae",
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

function keys() {
  return generateKeyPairSync("ed25519");
}

async function signed(
  privateKey: ReturnType<typeof keys>["privateKey"],
  content: ExecutableContent = CONTENT,
  ttlSeconds = 60,
): Promise<SignedExecutionAuthorization> {
  return new AuthorizationSigner(crypto).sign(
    {
      decisionId: "decision-poae",
      decisionOutcome: "APPROVED",
      businessTransactionId: content.businessTransactionId,
      policyName: "policy-a",
      policyVersion: "1.0.0",
      executableContent: content,
    },
    privateKey,
    "key-1",
    ttlSeconds,
  );
}

function request(
  content: ExecutableContent,
  authorization: SignedExecutionAuthorization,
): ExecutionRequest {
  return {
    businessTransactionId: content.businessTransactionId,
    action: content.action,
    target: content.target,
    parameters: content.parameters,
    authorization,
  };
}

function gateway(
  publicKey: string,
  connector: CountingConnector,
  nonceStore = new MemoryNonceStore(),
) {
  return new ExecutionGateway({
    allowUnverifiedPolicy: true,
    publicKey,
    nonceStore,
    connector,
  });
}

describe("PoAE benchmark (implemented tests)", () => {
  it("AM-01: authorization used after its expiry is denied", async () => {
    const { privateKey, publicKey } = keys();
    const authorization = await signed(privateKey, CONTENT, 60);
    const g = gateway(publicKey, new CountingConnector());

    const farFuture = new Date(
      Date.parse(authorization.payload.authorizedAt) + 120_000,
    );
    const { result } = await g.verify(
      request(CONTENT, authorization),
      farFuture,
    );

    expect(result.valid).toBe(false);
    expect(result.checks.notExpired).toBe(false);
  });

  it("XM-01: a changed amount is denied before the connector runs (content-hash check)", async () => {
    const { privateKey, publicKey } = keys();
    const authorization = await signed(privateKey);
    const connector = new CountingConnector();
    const g = gateway(publicKey, connector);

    const changed = { ...CONTENT, parameters: { amount: 999 } };

    await expect(g.execute(request(changed, authorization))).rejects.toThrow(
      /businessTransactionHash mismatch/,
    );
    expect(connector.calls).toBe(0);
  });

  it("XM-02: a changed target is denied before the connector runs (content-hash check)", async () => {
    const { privateKey, publicKey } = keys();
    const authorization = await signed(privateKey);
    const connector = new CountingConnector();
    const g = gateway(publicKey, connector);

    const changed = { ...CONTENT, target: "account/99999" };

    await expect(g.execute(request(changed, authorization))).rejects.toThrow(
      /businessTransactionHash mismatch/,
    );
    expect(connector.calls).toBe(0);
  });

  it("RT-01: an approved transaction submitted twice is released once", async () => {
    const { privateKey, publicKey } = keys();
    const authorization = await signed(privateKey);
    const connector = new CountingConnector();
    const g = gateway(publicKey, connector);

    await g.execute(request(CONTENT, authorization));
    await expect(g.execute(request(CONTENT, authorization))).rejects.toThrow();

    expect(connector.calls).toBe(1);
  });

  it("RT-02: a nonce reused with different content is denied", async () => {
    const { privateKey, publicKey } = keys();
    const authorization = await signed(privateKey);
    const connector = new CountingConnector();
    const g = gateway(publicKey, connector);

    await g.execute(request(CONTENT, authorization));

    const different = { ...CONTENT, parameters: { amount: 5 } };
    await expect(
      g.execute(request(different, authorization)),
    ).rejects.toThrow();

    expect(connector.calls).toBe(1);
  });

  it("RT-03: an authorization presented after expiry, following a release, is denied", async () => {
    const { privateKey, publicKey } = keys();
    const authorization = await signed(privateKey, CONTENT, 60);
    const g = gateway(publicKey, new CountingConnector());

    await g.execute(request(CONTENT, authorization));

    const farFuture = new Date(
      Date.parse(authorization.payload.authorizedAt) + 120_000,
    );
    const { result } = await g.verify(
      request(CONTENT, authorization),
      farFuture,
    );

    expect(result.valid).toBe(false);
  });

  it("CE-02: altered signature bytes are rejected", async () => {
    const { privateKey, publicKey } = keys();
    const authorization = await signed(privateKey);
    const connector = new CountingConnector();
    const g = gateway(publicKey, connector);

    const last = authorization.signature.slice(-1) === "A" ? "B" : "A";
    const altered: SignedExecutionAuthorization = {
      ...authorization,
      signature: authorization.signature.slice(0, -1) + last,
    };

    await expect(g.execute(request(CONTENT, altered))).rejects.toThrow();
    expect(connector.calls).toBe(0);
  });

  it("CE-03: an authorization signed by a key outside the trust root is rejected", async () => {
    const signer = keys();
    const trusted = keys();
    const authorization = await signed(signer.privateKey);
    const connector = new CountingConnector();
    const g = gateway(trusted.publicKey, connector);

    await expect(g.execute(request(CONTENT, authorization))).rejects.toThrow();
    expect(connector.calls).toBe(0);
  });

  it("EM-02 (record level): a dispatched amount that differs from the authorized content is reported as failed", () => {
    const record = {
      trustRecordId: "tr-em02",
      authorization: {
        payload: {
          nonce: "n-1",
          businessTransactionHash: "hash-authorized",
        },
      },
      executions: [
        {
          executionId: "e-1",
          evidence: {
            correspondence: {
              schemaVersion: 1,
              authorizationNonce: "n-1",
              authorizedContentHash: "hash-authorized",
              dispatchedContentHash: "hash-amount-999",
            },
          },
        },
      ],
    } as unknown as ExecutionTrustRecord;

    expect(checkTrustRecordCorrespondenceOffline(record).status).toBe("failed");
  });

  it("EM-01 (record level): a dispatched vendor that differs from the authorized content is reported as failed", () => {
    const record = {
      trustRecordId: "tr-em01",
      authorization: {
        payload: {
          nonce: "n-1",
          businessTransactionHash: "hash-authorized",
        },
      },
      executions: [
        {
          executionId: "e-1",
          evidence: {
            correspondence: {
              schemaVersion: 1,
              authorizationNonce: "n-1",
              authorizedContentHash: "hash-authorized",
              dispatchedContentHash: "hash-other-vendor",
            },
          },
        },
      ],
    } as unknown as ExecutionTrustRecord;

    expect(checkTrustRecordCorrespondenceOffline(record).status).toBe("failed");
  });

  it("EM-04 (record level): a record that omits the dispatched hash is not reported as passed", () => {
    const record = {
      trustRecordId: "tr-em04",
      authorization: {
        payload: {
          nonce: "n-1",
          businessTransactionHash: "hash-authorized",
        },
      },
      executions: [
        {
          executionId: "e-1",
          evidence: {
            correspondence: {
              schemaVersion: 1,
              authorizationNonce: "n-1",
              authorizedContentHash: "hash-authorized",
            },
          },
        },
      ],
    } as unknown as ExecutionTrustRecord;

    expect(checkTrustRecordCorrespondenceOffline(record).status).toBe("failed");
  });
});

describe("PoAE benchmark (additional tests)", () => {
  const FUTURE = new Date(Date.now() + 3_600_000).toISOString();

  function registry(
    active: Record<string, { grantId: string; validUntil: Date }>,
  ) {
    return {
      async findActive(callerId: string) {
        return active[callerId] ?? null;
      },
    };
  }

  async function grantedAuthorization(
    privateKey: ReturnType<typeof keys>["privateKey"],
    submittedBy: string | undefined,
  ) {
    return new AuthorizationSigner(crypto).sign(
      {
        decisionId: "decision-grant",
        decisionOutcome: "APPROVED",
        businessTransactionId: CONTENT.businessTransactionId,
        policyName: "policy-a",
        policyVersion: "1.0.0",
        executableContent: CONTENT,
        grantedCapability: CONTENT.action,
        ...(submittedBy !== undefined && { submittedBy }),
        authorityGrant: { grantId: "grant-1", validUntil: FUTURE },
      },
      privateKey,
      "key-1",
      60,
    );
  }

  it("AM-02: a revoked grant cannot authorize execution; the allow pair executes", async () => {
    const { privateKey, publicKey } = keys();
    const authorization = await grantedAuthorization(privateKey, "agent-a");

    const revoked = new ExecutionGateway({
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      connector: new CountingConnector(),
      authorityGrants: registry({}),
    });
    await expect(
      revoked.execute(request(CONTENT, authorization)),
    ).rejects.toThrow();

    const active = new ExecutionGateway({
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      connector: new CountingConnector(),
      authorityGrants: registry({
        "agent-a": { grantId: "grant-1", validUntil: new Date(FUTURE) },
      }),
    });
    await expect(
      active.execute(request(CONTENT, authorization)),
    ).resolves.toMatchObject({
      success: true,
    });
  });

  it("AM-03: a grant-bound authorization with no authenticated caller is denied; the allow pair executes", async () => {
    const { privateKey, publicKey } = keys();
    const anonymous = await grantedAuthorization(privateKey, undefined);
    const named = await grantedAuthorization(privateKey, "agent-a");
    const reg = registry({
      "agent-a": { grantId: "grant-1", validUntil: new Date(FUTURE) },
    });

    const connector = new CountingConnector();
    const g = new ExecutionGateway({
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      connector,
      authorityGrants: reg,
    });

    await expect(g.execute(request(CONTENT, anonymous))).rejects.toThrow();
    expect(connector.calls).toBe(0);

    await expect(g.execute(request(CONTENT, named))).resolves.toMatchObject({
      success: true,
    });
  });

  it("RT-04: a grant reused by another agent is denied; the holder's allow pair executes", async () => {
    const { privateKey, publicKey } = keys();
    const reused = await grantedAuthorization(privateKey, "agent-b");
    const own = await grantedAuthorization(privateKey, "agent-a");

    const g = new ExecutionGateway({
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      connector: new CountingConnector(),
      authorityGrants: registry({
        "agent-b": { grantId: "grant-other", validUntil: new Date(FUTURE) },
        "agent-a": { grantId: "grant-1", validUntil: new Date(FUTURE) },
      }),
    });

    await expect(g.execute(request(CONTENT, reused))).rejects.toThrow();
    await expect(g.execute(request(CONTENT, own))).resolves.toMatchObject({
      success: true,
    });
  });

  it("XM-03: a policy changed after authorization is denied; the unchanged policy executes", async () => {
    const { privateKey, publicKey } = keys();
    const policyV1 = {
      name: "policy-a",
      version: "1.0.0",
      rules: [{ max: 10000 }],
    };
    const policyV2 = {
      name: "policy-a",
      version: "1.0.0",
      rules: [{ max: 1 }],
    };
    const hasher = new TrustRecordHasher(crypto);
    const hashV1 = await hasher.hash(policyV1);

    const authorization = await new AuthorizationSigner(crypto).sign(
      {
        decisionId: "decision-policy",
        decisionOutcome: "APPROVED",
        businessTransactionId: CONTENT.businessTransactionId,
        policyName: "policy-a",
        policyVersion: "1.0.0",
        policyContentHash: hashV1,
        executableContent: CONTENT,
      },
      privateKey,
      "key-1",
      60,
    );

    const approve = { verify: async () => undefined };

    let live: unknown = policyV1;
    const repo = { load: async () => live };
    const make = (connector: CountingConnector) =>
      new ExecutionGateway({
        publicKey,
        nonceStore: new MemoryNonceStore(),
        connector,
        policyRepository: repo as never,
        policyApprovalVerifier: approve as never,
      });

    const unchanged = new CountingConnector();
    await expect(
      make(unchanged).execute(request(CONTENT, authorization)),
    ).resolves.toMatchObject({
      success: true,
    });

    live = policyV2;
    const changed = new CountingConnector();
    await expect(
      make(changed).execute(request(CONTENT, authorization)),
    ).rejects.toThrow();
    expect(changed.calls).toBe(0);
  });

  it("XM-04: a policy lookup failure fails closed and the connector is not called", async () => {
    const { privateKey, publicKey } = keys();
    const hashV1 = await new TrustRecordHasher(crypto).hash({
      name: "policy-a",
    });
    const authorization = await new AuthorizationSigner(crypto).sign(
      {
        decisionId: "decision-xm04",
        decisionOutcome: "APPROVED",
        businessTransactionId: CONTENT.businessTransactionId,
        policyName: "policy-a",
        policyVersion: "1.0.0",
        policyContentHash: hashV1,
        executableContent: CONTENT,
      },
      privateKey,
      "key-1",
      60,
    );

    const connector = new CountingConnector();
    const down = new ExecutionGateway({
      publicKey,
      nonceStore: new MemoryNonceStore(),
      connector,
      policyRepository: {
        load: async () => {
          throw new Error("policy service unavailable");
        },
      } as never,
      policyApprovalVerifier: { verify: async () => undefined } as never,
    });

    await expect(
      down.execute(request(CONTENT, authorization)),
    ).rejects.toThrow();
    expect(connector.calls).toBe(0);
  });

  it("CE-04: a completed execution whose trust record is removed from the ledger is detected", () => {
    const withRecord = [
      { trustRecordId: "tr-1", authorization: { payload: { nonce: "n1" } } },
      { trustRecordId: "tr-2", authorization: { payload: { nonce: "n2" } } },
    ] as unknown as ExecutionTrustRecord[];
    const outcomes = [
      { nonce: "n1", status: "completed" as const },
      { nonce: "n2", status: "completed" as const },
    ];

    expect(reconcileExecutionEvidence(outcomes, withRecord).status).toBe(
      "passed",
    );
    expect(
      reconcileExecutionEvidence(outcomes, withRecord.slice(0, 1)).status,
    ).toBe("failed");
  });

  it("CE-01: an altered signed trust record fails offline verification; the original verifies", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ format: "pem", type: "spki" }).toString();

    const draft = {
      trustRecordId: "txn-ce01",
      businessTransactionId: "txn-ce01",
      transaction: {
        businessTransactionId: "txn-ce01",
        status: "RECEIVED",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      overrides: [],
      executions: [],
      verifications: [],
      receipts: [],
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    } as unknown as ExecutionTrustRecord;

    const hasher = new TrustRecordHasher({
      hash: new SHA256HashProvider(),
      signature: new Ed25519SignatureProvider(),
    });
    const trustRecordHash = await hasher.hash(
      canonicalExecutionTrustRecord(draft),
    );
    const withHash = {
      ...draft,
      trustRecordHash,
      signature: {
        algorithm: "ed25519" as const,
        keyId: "k1",
        value: "",
        signedAt: new Date(),
      },
    } as unknown as ExecutionTrustRecord;
    const value = await new ArtifactSigner({
      hash: new SHA256HashProvider(),
      signature: new Ed25519SignatureProvider(),
    }).sign(canonicalExecutionTrustRecord(withHash), privateKey);
    const record = {
      ...withHash,
      signature: { ...withHash.signature, value },
    } as ExecutionTrustRecord;

    const options = { allowLegacyOnly: true };
    expect(
      (await verifyExecutionTrustRecordOffline(record, { k1: pem }, options))
        .valid,
    ).toBe(true);

    const altered = {
      ...record,
      transaction: { ...record.transaction, status: "COMPLETED" },
    } as ExecutionTrustRecord;
    expect(
      (await verifyExecutionTrustRecordOffline(altered, { k1: pem }, options))
        .valid,
    ).toBe(false);
  });
});

/**
 * EM-03 (direct execution bypassing the gateway) is not run here. It is
 * covered by the existing architecture test, tests/architecture/
 * execution-boundary.test.ts, which fails the build if any package other
 * than execution-gateway owns a production execution path.
 */

/**
 * Benchmark tests not implemented in this runner. Each is recorded as
 * "not run" in the results, with the reason.
 */
export const NOT_RUN: Readonly<Record<string, string>> = {
  "AM-04": "authority version binding absent (gap G-A)",
  "EM-03":
    "covered by tests/architecture/execution-boundary.test.ts, not run as a benchmark test here",
};
