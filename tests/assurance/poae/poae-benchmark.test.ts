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
  AuthorizationSigner,
  CryptoBootstrap,
  ExecutableContentHasher,
} from "@parmana/crypto";
import { checkTrustRecordCorrespondenceOffline } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { ExecutionRequest } from "@parmana/execution-system";
import {
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

/**
 * Benchmark tests not implemented in this runner. Each is recorded as
 * "not run" in the results, with the reason.
 */
export const NOT_RUN: Readonly<Record<string, string>> = {
  "AM-02": "revocation registry not exercised by this runner",
  "AM-03": "unauthenticated authority source not modelled in fixtures",
  "AM-04": "authority version binding absent (gap G-A)",
  "XM-03":
    "policy change after authorization needs the policy binding path, which the legacy fixture bypasses",
  "XM-04": "fault injection for the authorization service not implemented",
  "EM-03": "direct execution bypassing the gateway not implemented",
  "RT-04": "agent identity binding not modelled in fixtures",
  "CE-01": "signed trust-record tampering not implemented",
  "CE-04": "ledger reconciliation absent (gap G-L)",
};
