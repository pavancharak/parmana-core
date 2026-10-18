import { describe, expect, it } from "vitest";

import {
  brandCredentialHandle,
  connectorCapabilities,
  type Connector,
  type ConnectorExecutionContext,
} from "@parmana/connector-sdk";
import { CryptoBootstrap } from "@parmana/crypto";
import {
  InMemorySecureConnector,
  type GatewayExecutionRequest,
} from "@parmana/execution-control";
import type { SignedExecutionAuthorization } from "@parmana/shared";

import { SdkConnectorExecutor } from "../../src/connector-execution/SdkConnectorExecutor.js";

/**
 * The release context (ADR-0013) reaches a connector: the Secure
 * Connector passes the authorization and the approvals to the executor,
 * and the executor gives the connector its id, policy and approvals.
 */

const authorization = {
  payload: {
    version: 1,
    authorizationId: "auth-7",
    nonce: "n",
    decisionId: "d",
    decisionOutcome: "APPROVED",
    businessTransactionId: "bt-42",
    policyName: "erp-invoice",
    policyVersion: "1.0.0",
    policyContentHash: "c0ffee",
    authorizedAt: "2026-10-01T10:00:00.000Z",
    expiresAt: "2026-10-01T10:01:00.000Z",
    businessTransactionHash: "h",
  },
  signature: "s",
  keyId: "default",
  algorithm: "ed25519",
} as SignedExecutionAuthorization;

function setUp() {
  const seen: ConnectorExecutionContext[] = [];
  const connector: Connector = {
    connectorId: "ext-erp:create-invoice",
    capabilities: connectorCapabilities(["erp:create-invoice"]),
    async execute(_request, context) {
      seen.push(context);
      return { success: true };
    },
  };

  const secureConnector = new InMemorySecureConnector({
    identity: {
      connectorId: connector.connectorId,
      publicIdentity: "test",
      authenticationMetadata: {},
    },
    capabilities: ["erp:create-invoice"],
    policy: { assertAllowed: async () => undefined },
    gatewayAuthentication: "test",
    credentialVault: {
      getCredential: async () => ({
        value: brandCredentialHandle({
          providerId: "none",
          credentialId: "none",
          value: undefined,
        }),
      }),
    },
    executor: new SdkConnectorExecutor({
      connector,
      metadata: {
        connectorId: connector.connectorId,
        displayName: "ERP",
        version: { major: 1, minor: 0, patch: 0 },
        health: { status: "healthy", checkedAt: new Date().toISOString() },
      },
      credentialProviderId: "none",
      crypto: CryptoBootstrap.create(),
    }),
  });

  return { seen, secureConnector };
}

function gatewayRequest(
  approvals?: GatewayExecutionRequest["approvals"],
): GatewayExecutionRequest {
  return {
    authorization,
    executableContent: {
      businessTransactionId: "bt-42",
      action: "erp:create-invoice",
      target: "customer-42",
      parameters: { amount: 1200 },
    },
    verifiedTransaction: {
      authorizationVerified: true,
      executableContentVerified: true,
      replayCheckPassed: true,
    },
    executionTimestamp: new Date().toISOString(),
    gatewayIdentity: {
      gatewayId: "g",
      publicIdentity: "g",
      authenticationMetadata: {},
    },
    gatewaySession: {
      sessionId: "s",
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      authorizationId: "auth-7",
    },
    ...(approvals !== undefined ? { approvals } : {}),
  };
}

describe("release context from the Secure Connector to the connector", () => {
  it("gives the connector the authorization id, policy and approvals", async () => {
    const { seen, secureConnector } = setUp();

    await secureConnector.execute(
      gatewayRequest([
        {
          approverId: "manager-x",
          keyId: "manager-x-key-1",
          approvalId: "ap-1",
        },
      ]),
    );

    expect(seen[0]?.release).toEqual({
      authorizationId: "auth-7",
      policy: { name: "erp-invoice", version: "1.0.0", contentHash: "c0ffee" },
      approvals: [
        {
          approverId: "manager-x",
          keyId: "manager-x-key-1",
          approvalId: "ap-1",
        },
      ],
    });
    expect(Object.isFrozen(seen[0]?.release)).toBe(true);
  });

  it("gives an empty approval list when the Gateway listed none", async () => {
    const { seen, secureConnector } = setUp();

    await secureConnector.execute(gatewayRequest());

    expect(seen[0]?.release?.approvals).toEqual([]);
  });
});
