import { generateKeyPairSync } from "node:crypto";

import {
  ArtifactSigner,
  AuthorizationSigner,
  CryptoBootstrap,
  TrustRecordHasher,
} from "@parmana/crypto";

import { MemoryNonceStore } from "@parmana/envelope-verifier";

import {
  DefaultConnectorPolicy,
  ExecutionControlService,
  GatewayAttestationSigner,
  InMemoryGatewaySessionStore,
  MemoryExecutionAuditSink,
  RandomIdGenerator,
  SessionCredentialExecutionControl,
  SignedTokenConnectorAuthenticator,
  SystemClock,
  type ConnectorIdentity,
  type GatewayIdentity,
} from "@parmana/execution-control";

import {
  MockConnector,
  StaticCredentialProvider,
  connectorCapabilities,
  healthyNow,
} from "@parmana/connector-sdk";

import {
  ExecutionGateway,
  createGatewayConnectorRegistry,
  type ConnectorRequest,
} from "@parmana/execution-gateway";

import {
  PolicyAction,
  PolicyEngine,
  PolicyOutcome,
  type Policy,
} from "@parmana/policy";

import type { ExecutionRequest } from "@parmana/execution-system";
import type { ExecutableContent, ExecutionResult } from "@parmana/shared";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 60 - End-to-End Enterprise Execution");
  console.log("==================================================");
  console.log();

  //
  // Stage 1: Business Transaction
  //
  const content: ExecutableContent = {
    businessTransactionId: "txn-e2e-1",
    action: "sap:post-invoice",
    target: "sap/invoice/INV-2026-100",
    parameters: {
      vendorId: "VENDOR-1001",
      amount: 25000,
      currency: "USD",
    },
  };

  console.log("Stage 1 - Business Transaction");

  console.log("--------------------------------------------------");

  console.log(`Vendor  : ${content.parameters.vendorId}`);

  console.log(
    `Amount  : ${content.parameters.amount} ${content.parameters.currency}`,
  );

  console.log(`Action  : ${content.action}`);

  console.log();

  //
  // Stage 2: Policy Evaluation
  //
  console.log("Stage 2 - Policy Evaluation");

  console.log("--------------------------------------------------");

  const policy: Policy = {
    policyId: "vendor-payment-policy",
    policyVersion: "1.0.0",
    schemaVersion: "1.0.0",
    rules: [
      {
        id: "approve-under-threshold",
        condition: { fact: "amount", operator: "lte", value: 50_000 },
        outcome: {
          action: PolicyAction.APPROVE,
          reason: "Amount within auto-approval threshold.",
        },
      },
      {
        id: "default-reject",
        condition: { always: true },
        outcome: {
          action: PolicyAction.REJECT,
          reason: "No matching rule.",
        },
      },
    ],
  };

  const decision = new PolicyEngine().evaluate(policy, {
    amount: content.parameters.amount as number,
  });

  console.log(`Outcome : ${decision.outcome}`);

  console.log(`Reason  : ${decision.reason}`);

  if (decision.outcome !== PolicyOutcome.APPROVE) {
    throw new Error("Policy did not approve this transaction.");
  }

  console.log();

  //
  // Stage 3: Signed Authorization
  //
  // Two independent, in-memory keypairs, generated fresh every
  // run — never read from keys/. Production sources the Runtime's
  // authorization key the same way it always has (FileKeyProvider,
  // keyId "default"); the Gateway's attestation key is loaded
  // separately, via FileKeyProvider with PARMANA_GATEWAY_KEY_ID
  // (default "gateway") — see createGatewayKeyPair.ts. Neither
  // pattern belongs in a deployed system: this tutorial generates
  // both purely so it runs with zero setup on a fresh clone.
  //
  const { privateKey: runtimePrivateKey, publicKey: runtimePublicKey } =
    generateKeyPairSync("ed25519");

  const { privateKey: gatewayPrivateKey, publicKey: gatewayPublicKey } =
    generateKeyPairSync("ed25519");

  const crypto = CryptoBootstrap.create();

  console.log("Stage 3 - Signed Authorization");

  console.log("--------------------------------------------------");

  const authorization = await new AuthorizationSigner(crypto).sign(
    {
      decisionId: "decision-1",
      businessTransactionId: content.businessTransactionId,
      policyName: policy.policyId,
      policyVersion: policy.policyVersion,
      executableContent: content,
    },
    runtimePrivateKey,
    "runtime-key-1",
    60,
  );

  console.log(`Authorization ID : ${authorization.payload.authorizationId}`);

  console.log(`Expires At       : ${authorization.payload.expiresAt}`);

  console.log();

  //
  // Gateway / Connector / Session infrastructure.
  //
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

  const attestationSigner = new GatewayAttestationSigner(
    new SystemClock(),
    new RandomIdGenerator(),
  );

  const authenticator = new SignedTokenConnectorAuthenticator(
    gatewayIdentity,
    gatewayPublicKey,
    [connectorIdentity],
  );

  const sessionIssuanceAuthentication = Object.freeze({
    capability: "session-issuer",
  });

  const sessions = new InMemoryGatewaySessionStore(
    sessionIssuanceAuthentication,
  );

  const audit = new MemoryExecutionAuditSink();

  //
  // Static, registration-time attestation for the connector's own
  // defense-in-depth check — mirrors createConnectorRegistry.ts.
  //
  const registrationAttestation = attestationSigner.sign(
    gatewayIdentity.gatewayId,
    "registration",
    gatewayPrivateKey,
  );

  const registry = createGatewayConnectorRegistry([
    {
      connector: new MockConnector({
        connectorId: "sap",
        capabilities: connectorCapabilities(["sap:post-invoice"]),
      }),

      metadata: {
        connectorId: "sap",
        displayName: "SAP",
        version: { major: 1, minor: 0, patch: 0 },
        health: healthyNow(),
      },

      connectorIdentity,

      credentialProvider: new StaticCredentialProvider({
        sap: { apiKey: "sap-secret-100" },
      }),

      policy: new DefaultConnectorPolicy(authenticator, sessions),

      gatewayAuthentication: registrationAttestation,

      crypto,

      audit,
    },
  ]);

  const executionControl = new SessionCredentialExecutionControl({
    gatewayIdentity,
    authenticator,
    inner: new ExecutionControlService({
      gatewayIdentity,
      authenticator,
      registry,
      sessions,
      sessionIssuanceAuthentication,
      audit,
    }),
  });

  const request: ExecutionRequest = {
    businessTransactionId: content.businessTransactionId,
    action: content.action,
    target: content.target,
    parameters: content.parameters,
    authorization,
  };

  //
  // Stage 4: Gateway Envelope Verification
  //
  // A separate preview Gateway, with its own NonceStore, verifies
  // the same envelope purely for display — calling verify() on the
  // production Gateway below would otherwise burn the nonce before
  // execute() ever ran.
  //
  console.log("Stage 4 - Gateway Envelope Verification");

  console.log("--------------------------------------------------");

  const previewGateway = new ExecutionGateway({
    // Legacy fixture: predates fail-closed policy binding.
    allowUnverifiedPolicy: true,
    publicKey: runtimePublicKey,
    nonceStore: new MemoryNonceStore(),
    connector: {
      async execute(r: ConnectorRequest): Promise<ExecutionResult> {
        return {
          businessTransactionId: r.transaction.businessTransactionId,
          action: r.transaction.action,
          target: r.transaction.target,
          parameters: r.transaction.parameters,
          success: true,
          executedAt: new Date(),
          metadata: {},
        };
      },
    },
  });

  const { result: verification } = await previewGateway.verify(request);

  console.log(
    `Signature Verified          : ${verification.checks.signatureVerified}`,
  );

  console.log(
    `Not Expired                 : ${verification.checks.notExpired}`,
  );

  console.log(
    `Content Hash Matches        : ${verification.checks.businessTransactionHashMatches}`,
  );

  console.log(
    `Nonce Unseen                 : ${verification.checks.nonceUnseen}`,
  );

  console.log();

  //
  // Stage 5: Request-Bound Attestation (preview)
  //
  console.log("Stage 5 - Request-Bound Attestation");

  console.log("--------------------------------------------------");

  const attestationPreview = attestationSigner.sign(
    gatewayIdentity.gatewayId,
    authorization.payload.authorizationId,
    gatewayPrivateKey,
  );

  console.log(
    `Bound To Authorization : ${attestationPreview.payload.authorizationId}`,
  );

  console.log(
    "The production Gateway below mints an equivalent, fresh attestation internally, once per execute() call.",
  );

  console.log();

  //
  // Stages 6-8: Session Credential Issue, Connector Execution,
  // Credential Destroyed — all inside SessionCredentialSecureConnector,
  // reached through the production Gateway's execute().
  //
  const productionGateway = new ExecutionGateway({
    // Legacy fixture: predates fail-closed policy binding.
    allowUnverifiedPolicy: true,
    publicKey: runtimePublicKey,
    nonceStore: new MemoryNonceStore(),
    executionControl: {
      service: executionControl,
      mintGatewayAuthentication: (authorizationId) =>
        attestationSigner.sign(
          gatewayIdentity.gatewayId,
          authorizationId,
          gatewayPrivateKey,
        ),
      route: () => "sap",
    },
  });

  console.log(
    "Stage 6-8 - Session Credential Issue, Connector Execution, Credential Destroyed",
  );

  console.log("--------------------------------------------------");

  const result = await productionGateway.execute(request);

  console.log(`Result : ${result.success ? "SUCCESS" : "FAILURE"}`);

  console.log();

  //
  // Stage 9: Audit Record
  //
  console.log("Stage 9 - Audit Record");

  console.log("--------------------------------------------------");

  //
  // ExecutionControlService records its own generic
  // "execution.completed" event too, after connector.execute()
  // returns — this picks out the connector's own, richer event
  // (the one carrying credentialId/gatewayId), not that one.
  //
  const completedEvent = audit.events.find(
    (event) => event.credentialId !== undefined,
  )!;

  console.log(`Type          : ${completedEvent.type}`);

  console.log(`Connector     : ${completedEvent.connectorId}`);

  console.log(`Credential ID : ${completedEvent.credentialId}`);

  console.log(`Gateway ID    : ${completedEvent.gatewayId}`);

  console.log(`Authorization : ${completedEvent.authorizationId}`);

  console.log(`Occurred At   : ${completedEvent.occurredAt}`);

  console.log();

  //
  // Stage 10: Trust Record
  //
  console.log("Stage 10 - Trust Record");

  console.log("--------------------------------------------------");

  const trustRecordDraft = {
    businessTransactionId: content.businessTransactionId,
    authorizationId: authorization.payload.authorizationId,
    connectorId: completedEvent.connectorId,
    credentialId: completedEvent.credentialId,
    gatewayId: completedEvent.gatewayId,
    action: content.action,
    target: content.target,
    success: result.success,
    createdAt: new Date().toISOString(),
  };

  const trustRecordHash = await new TrustRecordHasher(crypto).hash(
    trustRecordDraft,
  );

  const trustRecordSignature = await new ArtifactSigner(crypto).sign(
    trustRecordDraft,
    runtimePrivateKey,
  );

  console.log(`Trust Record Hash      : ${trustRecordHash}`);

  console.log(`Signature Algorithm    : ${crypto.signature.algorithm}`);

  console.log(
    `Signature (first 24)   : ${trustRecordSignature.slice(0, 24)}...`,
  );

  console.log();

  console.log(
    "✓ Full chain complete: policy → authorization → envelope → attestation → session credential → connector → audit → trust record.",
  );

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
