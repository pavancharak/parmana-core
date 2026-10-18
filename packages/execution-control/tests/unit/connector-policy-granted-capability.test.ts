import { generateKeyPairSync } from "node:crypto";

import { AuthorizationSigner, CryptoBootstrap } from "@parmana/crypto";
import type { ExecutableContent, ExecutionResult } from "@parmana/shared";
import { describe, expect, it } from "vitest";

import {
  DefaultConnectorPolicy,
  InMemoryConnectorAuthenticator,
  InMemoryGatewaySessionStore,
  InMemorySecureConnector,
  InMemoryCredentialVault,
  type ExecutionRelease,
  type GatewayIdentity,
} from "../../src/index.js";

/**
 * Defense-in-depth check added alongside ExecutionAuthorizationPayload's
 * new grantedCapability field: DefaultConnectorPolicy.assertAllowed()
 * now confirms the executed action matches the signed authorization's
 * grantedCapability, when present, rather than trusting only the
 * pre-computed verifiedTransaction booleans and the connector's own
 * declared capability list.
 */
const content: ExecutableContent = {
  businessTransactionId: "txn-granted-capability-1",
  action: "hubspot:deal-update",
  target: "hubspot/deal/1",
  parameters: { dealstage: "closedwon" },
};

async function fixture(grantedCapability?: string) {
  const { privateKey } = generateKeyPairSync("ed25519");

  const authorization = await new AuthorizationSigner(
    CryptoBootstrap.create(),
  ).sign(
    {
      decisionId: "decision-1",
      decisionOutcome: "APPROVED",
      businessTransactionId: content.businessTransactionId,
      policyName: "hubspot-deal-update",
      policyVersion: "1.0.0",
      submittedBy: "caller-alice",
      ...(grantedCapability !== undefined && { grantedCapability }),
      executableContent: content,
    },
    privateKey,
    "key-1",
    60,
  );

  const gatewayIdentity: GatewayIdentity = {
    gatewayId: "gateway-1",
    publicIdentity: "spiffe://parmana/gateway",
    authenticationMetadata: { mechanism: "in-memory-token" },
  };
  const connectorIdentity = {
    connectorId: "hubspot",
    publicIdentity: "spiffe://parmana/connectors/hubspot",
    authenticationMetadata: { mechanism: "in-memory-registry" },
  };
  const gatewayAuthentication = Object.freeze({ token: "gateway-only" });
  const sessionIssuanceAuthentication = Object.freeze({
    capability: "session-issuer",
  });
  const sessions = new InMemoryGatewaySessionStore(
    sessionIssuanceAuthentication,
  );
  const authenticator = new InMemoryConnectorAuthenticator(
    gatewayIdentity,
    gatewayAuthentication,
    [connectorIdentity],
  );
  const policy = new DefaultConnectorPolicy(authenticator, sessions);
  const vault = new InMemoryCredentialVault();
  vault.setCredential("hubspot", {
    value: Object.freeze({ token: "connector-secret" }),
  });

  const connector = new InMemorySecureConnector({
    identity: connectorIdentity,
    capabilities: ["hubspot:deal-update"],
    policy,
    gatewayAuthentication,
    credentialVault: vault,
    executor: {
      async execute(executableContent): Promise<ExecutionResult> {
        return {
          ...executableContent,
          success: true,
          executedAt: new Date(),
          metadata: {},
        };
      },
    },
  });

  const release: ExecutionRelease = {
    authorization,
    executableContent: content,
    verifiedTransaction: {
      authorizationVerified: true,
      executableContentVerified: true,
      replayCheckPassed: true,
    },
    executionTimestamp: new Date().toISOString(),
  };

  const session = sessions.create(
    release,
    "hubspot",
    30_000,
    sessionIssuanceAuthentication,
  );

  return {
    connector,
    request: {
      authorization,
      executableContent: content,
      verifiedTransaction: release.verifiedTransaction,
      executionTimestamp: release.executionTimestamp,
      gatewayIdentity,
      gatewaySession: session,
    },
  };
}

describe("DefaultConnectorPolicy grantedCapability consistency check", () => {
  it("allows execution when grantedCapability matches the executed action", async () => {
    const { connector, request } = await fixture("hubspot:deal-update");

    await expect(connector.execute(request)).resolves.toMatchObject({
      success: true,
    });
  });

  it("allows execution when grantedCapability is absent (caller-auth was disabled)", async () => {
    const { connector, request } = await fixture(undefined);

    await expect(connector.execute(request)).resolves.toMatchObject({
      success: true,
    });
  });

  it("rejects execution when grantedCapability names a different action than the one executed", async () => {
    const { connector, request } = await fixture("hubspot:deal-fetch");

    await expect(connector.execute(request)).rejects.toThrow(
      "granted capability",
    );
  });
});
