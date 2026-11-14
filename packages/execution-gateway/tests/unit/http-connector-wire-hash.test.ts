import { generateKeyPairSync } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AuthorizationSigner,
  CryptoBootstrap,
  ExecutableContentHasher,
  checkTrustRecordCorrespondenceOffline,
} from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { ExecutableContent, ExecutionResult } from "@parmana/shared";

import type { ConnectorRequest } from "../../src/ConnectorRequest.js";
import { ExecutionGateway, HttpConnector } from "../../src/index.js";

const crypto = CryptoBootstrap.create();
const hasher = new ExecutableContentHasher(crypto);

const CONTENT: ExecutableContent = {
  businessTransactionId: "txn-wire",
  action: "TransferFunds",
  target: "account/12345",
  parameters: { amount: 100 },
};

const RESULT: ExecutionResult = {
  businessTransactionId: CONTENT.businessTransactionId,
  action: CONTENT.action,
  target: CONTENT.target,
  parameters: CONTENT.parameters,
  success: true,
  executedAt: new Date("2026-11-14T00:00:00Z"),
  metadata: {},
};

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(JSON.stringify(RESULT), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
}

async function signed(
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
) {
  return new AuthorizationSigner(crypto).sign(
    {
      decisionId: "decision-wire",
      decisionOutcome: "APPROVED",
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpConnector wire hash", () => {
  it("hashes the content it sent, and that hash equals the hash of the content", async () => {
    stubFetch();
    const { privateKey } = generateKeyPairSync("ed25519");
    const authorization = await signed(privateKey);

    const connector = new HttpConnector({ baseUrl: "http://exec.test" });
    const request: ConnectorRequest = {
      transaction: CONTENT,
      authorization,
      verification: {} as never,
    };

    const result = await connector.execute(request);

    expect(result.wireContentHash).toBe(await hasher.hash(CONTENT));
  });

  it("the gateway records the connector-wire source and the check passes", async () => {
    stubFetch();
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const authorization = await signed(privateKey);

    const gateway = new ExecutionGateway({
      allowUnverifiedPolicy: true,
      publicKey,
      nonceStore: new MemoryNonceStore(),
      connector: new HttpConnector({ baseUrl: "http://exec.test" }),
    });

    const result = await gateway.execute({
      businessTransactionId: CONTENT.businessTransactionId,
      action: CONTENT.action,
      target: CONTENT.target,
      parameters: CONTENT.parameters,
      authorization,
    });

    expect(result.correspondence?.dispatchedHashSource).toBe("connector-wire");
    expect(result.correspondence?.dispatchedContentHash).toBe(
      authorization.payload.businessTransactionHash,
    );

    const record = {
      trustRecordId: "tr-wire",
      authorization,
      executions: [
        {
          executionId: "e-1",
          evidence: { correspondence: result.correspondence },
        },
      ],
    } as never;

    expect(checkTrustRecordCorrespondenceOffline(record).status).toBe("passed");
  });
});
