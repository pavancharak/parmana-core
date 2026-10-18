import { generateKeyPairSync } from "node:crypto";

import {
  DefaultConnectorPolicy,
  ExecutionControlService,
  GatewayAttestationSigner,
  InMemoryConnectorRegistry,
  InMemoryCredentialVault,
  InMemoryGatewaySessionStore,
  InMemorySessionCredentialVault,
  MemoryExecutionAuditSink,
  RandomIdGenerator,
  SessionCredentialExecutionControl,
  SessionCredentialSecureConnector,
  SystemClock,
  type ConnectorExecutor,
} from "@parmana/execution-control";

import { ExecutionGateway } from "@parmana/execution-gateway";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { ExecutionSystem } from "@parmana/execution-system";
import type { ExecutionResult } from "@parmana/shared";

import { createGatewayIdentity } from "../../src/bootstrap/createGatewayIdentity.js";
import { createGatewayKeyPair } from "../../src/bootstrap/createGatewayKeyPair.js";
import { createGatewayPublicKey } from "../../src/bootstrap/createGatewayPublicKey.js";
import { createConnectorRoute } from "../../src/bootstrap/createConnectorRoute.js";
import { createConnectorAuthenticator } from "../../src/bootstrap/createConnectorAuthenticator.js";

/**
 * Test-only re-composition of the exact chain
 * packages/api/src/bootstrap/{createExecutionGateway,createExecutionControl,
 * createConnectorRegistry}.ts build in production, using the same real
 * classes and reusing several of the same bootstrap helper functions
 * verbatim (createGatewayIdentity, createGatewayKeyPair,
 * createGatewayPublicKey, createConnectorRoute, createConnectorAuthenticator
 * all read the same on-disk gateway key the real server does).
 *
 * The one thing this does NOT do is call the real createExecutionControl /
 * createConnectorRegistry functions, because neither exposes the
 * MemoryExecutionAuditSink or InMemorySessionCredentialVault instance it
 * builds internally — there is no way to inspect them through the real
 * bootstrap chain. This file exists solely to hold direct references to
 * both, so an HTTP-level test can prove the credential-isolation guarantee
 * that packages/execution-control's own tests only prove at the library
 * level. No production file is modified.
 */
export interface InspectableExecutionSystem {
  readonly executionSystem: ExecutionSystem;
  readonly auditSink: MemoryExecutionAuditSink;
  readonly sessionCredentialVault: InMemorySessionCredentialVault;
}

export interface InspectableExecutionSystemOptions {
  /** Override the connector executor, e.g. to force a downstream failure. */
  readonly executor?: ConnectorExecutor;

  /**
   * Sign both the registration-time and per-request gateway attestations
   * with a throwaway keypair instead of the real gateway key on disk,
   * simulating a spoofed or otherwise invalid attestation. The
   * authenticator (createConnectorAuthenticator) still verifies against
   * the REAL public key, so this is guaranteed to fail verification.
   */
  readonly signAttestationWithWrongKey?: boolean;
}

export function createInspectableExecutionSystem(
  options: InspectableExecutionSystemOptions = {},
): InspectableExecutionSystem {
  const auditSink = new MemoryExecutionAuditSink();

  const gatewayIdentity = createGatewayIdentity();
  const { privateKey: realGatewayPrivateKey } = createGatewayKeyPair();
  const gatewayPublicKey = createGatewayPublicKey();
  const nonceStore = new MemoryNonceStore();
  const authenticator = createConnectorAuthenticator();
  const route = createConnectorRoute();

  const sessionIssuanceAuthentication = Object.freeze({});
  const sessions = new InMemoryGatewaySessionStore(
    sessionIssuanceAuthentication,
  );

  const attestationSigner = new GatewayAttestationSigner(
    new SystemClock(),
    new RandomIdGenerator(),
  );

  const signingKey = options.signAttestationWithWrongKey
    ? generateKeyPairSync("ed25519").privateKey
    : realGatewayPrivateKey;

  const clock = new SystemClock();

  const rawCredentials = new InMemoryCredentialVault();
  rawCredentials.setCredential("test-fixture", {
    value: Object.freeze({ token: "test-inspectable-token" }),
  });

  const sessionCredentialVault = new InMemorySessionCredentialVault({
    credentials: rawCredentials,
    clock,
    idGenerator: new RandomIdGenerator(),
    lifetimeMs: 30_000,
  });

  const executor: ConnectorExecutor = options.executor ?? {
    async execute(executableContent): Promise<ExecutionResult> {
      return {
        ...executableContent,
        success: true,
        executedAt: new Date(),
        metadata: {},
      };
    },
  };

  const connectorIdentity = {
    connectorId: "test-fixture",
    publicIdentity: "spiffe://parmana/connectors/test-fixture",
    authenticationMetadata: {},
  };

  const registrationAttestation = attestationSigner.sign(
    gatewayIdentity.gatewayId,
    "registration",
    signingKey,
  );

  const secureConnector = new SessionCredentialSecureConnector({
    identity: connectorIdentity,
    capabilities: ["test:fixture-execute"],
    policy: new DefaultConnectorPolicy(authenticator, sessions),
    gatewayAuthentication: registrationAttestation,
    sessionCredentials: sessionCredentialVault,
    executor,
    audit: auditSink,
    clock,
  });

  const registry = new InMemoryConnectorRegistry([secureConnector]);

  const controlService = new ExecutionControlService({
    // Unit test of control logic; release verification is tested elsewhere.
    verifyRelease: async () => {},
    gatewayIdentity,
    authenticator,
    registry,
    sessions,
    sessionIssuanceAuthentication,
    audit: auditSink,
  });

  const executionControl = new SessionCredentialExecutionControl({
    gatewayIdentity,
    authenticator,
    inner: controlService,
  });

  const gateway = new ExecutionGateway({
    // Legacy fixture: predates fail-closed policy binding.
    allowUnverifiedPolicy: true,
    publicKey: gatewayPublicKey,
    nonceStore,
    executionControl: {
      service: executionControl,
      mintGatewayAuthentication: (authorizationId) =>
        attestationSigner.sign(
          gatewayIdentity.gatewayId,
          authorizationId,
          signingKey,
        ),
      route,
    },
  });

  return {
    executionSystem: gateway,
    auditSink,
    sessionCredentialVault,
  };
}
