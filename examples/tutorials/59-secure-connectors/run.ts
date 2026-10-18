import { generateKeyPairSync } from "node:crypto";

import { AuthorizationSigner, CryptoBootstrap } from "@parmana/crypto";

import {
  DefaultConnectorPolicy,
  GatewayAttestationSigner,
  InMemoryCredentialVault,
  InMemoryGatewaySessionStore,
  InMemorySessionCredentialVault,
  MemoryExecutionAuditSink,
  RandomIdGenerator,
  SessionCredentialSecureConnector,
  SignedTokenConnectorAuthenticator,
  SystemClock,
  type ConnectorExecutor,
  type ConnectorIdentity,
  type ExecutionRelease,
  type GatewayExecutionRequest,
  type GatewayIdentity,
} from "@parmana/execution-control";

import type { ExecutableContent, ExecutionResult } from "@parmana/shared";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 59 - Secure Connectors");
  console.log("==================================================");
  console.log();

  //
  // Two independent, in-memory keypairs, matching production's
  // separation: the Runtime signs authorizations, the Gateway
  // signs attestations. Neither is read from disk.
  //
  const { privateKey: runtimePrivateKey } = generateKeyPairSync("ed25519");

  const { privateKey: gatewayPrivateKey, publicKey: gatewayPublicKey } =
    generateKeyPairSync("ed25519");

  const gatewayIdentity: GatewayIdentity = {
    gatewayId: "gateway-1",
    publicIdentity: "spiffe://parmana/gateway",
    authenticationMetadata: {},
  };

  const connectorIdentity: ConnectorIdentity = {
    connectorId: "sap",
    publicIdentity: "spiffe://parmana/connectors/sap",
    authenticationMetadata: {},
  };

  const content: ExecutableContent = {
    businessTransactionId: "txn-1",
    action: "sap:post-invoice",
    target: "sap/invoice/1",
    parameters: { amount: 5000 },
  };

  const authorization = await new AuthorizationSigner(
    CryptoBootstrap.create(),
  ).sign(
    {
      decisionId: "decision-1",
      businessTransactionId: content.businessTransactionId,
      policyName: "payments",
      policyVersion: "1.0.0",
      executableContent: content,
    },
    runtimePrivateKey,
    "key-1",
    60,
  );

  const attestationSigner = new GatewayAttestationSigner(
    new SystemClock(),
    new RandomIdGenerator(),
  );

  const authenticator = new SignedTokenConnectorAuthenticator(
    gatewayIdentity,
    gatewayPublicKey,
    [connectorIdentity],
  );

  //
  // Gateway Attestation
  //
  console.log("Gateway Attestation");

  console.log("--------------------------------------------------");

  const attestation = attestationSigner.sign(
    gatewayIdentity.gatewayId,
    authorization.payload.authorizationId,
    gatewayPrivateKey,
  );

  console.log(`Gateway ID       : ${attestation.payload.gatewayId}`);

  console.log(`Authorization ID : ${attestation.payload.authorizationId}`);

  console.log(`Nonce            : ${attestation.payload.nonce}`);

  console.log(`Issued At        : ${attestation.payload.issuedAt}`);

  console.log(
    "✓ Authenticates for its own authorizationId:",
    authenticator.authenticateGatewayForRequest(
      gatewayIdentity,
      attestation,
      authorization.payload.authorizationId,
    ),
  );

  console.log();

  //
  // Spoofed attestation.
  //
  console.log("Spoofed Attestation Rejected");

  console.log("--------------------------------------------------");

  const { privateKey: attackerPrivateKey } = generateKeyPairSync("ed25519");

  const spoofed = attestationSigner.sign(
    gatewayIdentity.gatewayId,
    authorization.payload.authorizationId,
    attackerPrivateKey,
  );

  console.log(
    "✗ Accepted:",
    authenticator.authenticateGatewayForRequest(
      gatewayIdentity,
      spoofed,
      authorization.payload.authorizationId,
    ),
  );

  console.log();

  //
  // Tampered attestation: same signature, different
  // authorizationId — a replay attempt against a
  // different request.
  //
  console.log("Attestation Replayed Against A Different Request");

  console.log("--------------------------------------------------");

  console.log(
    '✗ Accepted for "authorization-999":',
    authenticator.authenticateGatewayForRequest(
      gatewayIdentity,
      attestation,
      "authorization-999",
    ),
  );

  console.log();

  //
  // Secure Connector setup.
  //
  const sessionIssuanceAuthentication = Object.freeze({
    capability: "session-issuer",
  });

  const sessions = new InMemoryGatewaySessionStore(
    sessionIssuanceAuthentication,
  );

  const policy = new DefaultConnectorPolicy(authenticator, sessions);

  const rawCredentials = new InMemoryCredentialVault();

  rawCredentials.setCredential("sap", {
    value: Object.freeze({ apiKey: "sap-secret-4242" }),
  });

  const sessionCredentials = new InMemorySessionCredentialVault({
    credentials: rawCredentials,
    clock: new SystemClock(),
    idGenerator: new RandomIdGenerator(),
    lifetimeMs: 30_000,
  });

  const audit = new MemoryExecutionAuditSink();

  const executor: ConnectorExecutor = {
    async execute(executableContent): Promise<ExecutionResult> {
      return {
        ...executableContent,
        success: true,
        executedAt: new Date(),
        metadata: {},
      };
    },
  };

  const connector = new SessionCredentialSecureConnector({
    identity: connectorIdentity,
    capabilities: ["sap:post-invoice"],
    policy,
    gatewayAuthentication: attestation,
    sessionCredentials,
    executor,
    audit,
    clock: new SystemClock(),
  });

  const release: ExecutionRelease = {
    connectorName: "sap",
    authorization,
    executableContent: content,
    verifiedTransaction: {
      authorizationVerified: true,
      executableContentVerified: true,
      replayCheckPassed: true,
    },
    executionTimestamp: new Date().toISOString(),
  };

  function requestWithSession(
    session = sessions.create(
      release,
      connectorIdentity.connectorId,
      30_000,
      sessionIssuanceAuthentication,
    ),
  ): GatewayExecutionRequest {
    return {
      authorization,
      executableContent: content,
      verifiedTransaction: release.verifiedTransaction,
      executionTimestamp: release.executionTimestamp,
      gatewayIdentity,
      gatewaySession: session,
    };
  }

  //
  // Direct invocation without a genuine session.
  //
  console.log("Direct Invocation Without A Genuine Session");

  console.log("--------------------------------------------------");

  try {
    await connector.execute({
      authorization,
      executableContent: content,
      verifiedTransaction: release.verifiedTransaction,
      executionTimestamp: release.executionTimestamp,
      gatewayIdentity,
      gatewaySession: {
        sessionId: "forged",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        authorizationId: authorization.payload.authorizationId,
      },
    });

    console.log("✗ Unexpected: execution succeeded.");
  } catch (error) {
    console.log("✓ Rejected:");

    console.log(`  ${(error as Error).message}`);
  }

  console.log();

  //
  // Successful execution.
  //
  console.log("Successful Execution");

  console.log("--------------------------------------------------");

  const result = await connector.execute(requestWithSession());

  console.log(`Result: ${result.success ? "SUCCESS" : "FAILURE"}`);

  const completedEvent = audit.events[audit.events.length - 1];

  console.log("Audit Record:");

  console.log(`  type          : ${completedEvent?.type}`);

  console.log(`  connectorId   : ${completedEvent?.connectorId}`);

  console.log(`  credentialId  : ${completedEvent?.credentialId}`);

  console.log(`  gatewayId     : ${completedEvent?.gatewayId}`);

  console.log();

  //
  // Credential destroyed after execution.
  //
  console.log("Credential Destroyed After Execution");

  console.log("--------------------------------------------------");

  try {
    await sessionCredentials.consume(completedEvent!.credentialId!);

    console.log("✗ Unexpected: the same session credential resolved again.");
  } catch (error) {
    console.log(
      "✓ The session credential the connector used is already destroyed:",
    );

    console.log(`  ${(error as Error).message}`);
  }

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
