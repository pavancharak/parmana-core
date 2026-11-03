import { CryptoBootstrap } from "@parmana/crypto";

import {
  ExternalConnectorAwareRegistry,
  GatewayExternalAdapter,
  createGatewayConnectorRegistry,
  type ActiveExternalConnector,
  type GatewayConnectorRegistration,
  type GatewayExternalAdapterOptions,
} from "@parmana/execution-gateway";

import { StaticCredentialProvider } from "@parmana/connector-sdk";

import type {
  ConnectorRegistry,
  ConnectorAuthenticator,
  ExecutionAuditSink,
} from "@parmana/execution-control";

import {
  DefaultConnectorPolicy,
  InMemoryGatewaySessionStore,
  externalConnectorIdentity,
} from "@parmana/execution-control";
import type { ExternalConnectorRepository } from "@parmana/shared";

import { externalConnectorRepository } from "../repositories.js";

import { HubSpotMetadata } from "@parmana/connector-hubspot";
import { createHubSpotConnector } from "./createHubSpotConnector.js";
import { createHubSpotCredentialProvider } from "./createHubSpotCredentialProvider.js";
import { createTestFixtureConnector } from "./createTestFixtureConnector.js";
import { assertConnectorCapabilitiesBound } from "./assertConnectorCapabilitiesBound.js";
import { warnIfHubSpotTokenStale } from "./warnIfHubSpotTokenStale.js";

/**
 * Creates the production connector registry.
 *
 * gatewayAuthentication is the STATIC, registration-time attestation
 * checked by each connector's own defense-in-depth check (see
 * SessionCredentialSecureConnectorOptions.gatewayAuthentication) — it is
 * NOT request-bound; the request-bound check happens earlier, at
 * SessionCredentialExecutionControl.
 *
 * Every registration built here is checked by
 * assertConnectorCapabilitiesBound before the registry is returned —
 * see that file's doc comment for why an unbound capability is a
 * fail-closed startup error, not a runtime surprise.
 */
export function createConnectorRegistry(
  authenticator: ConnectorAuthenticator,
  sessions: InMemoryGatewaySessionStore,
  audit: ExecutionAuditSink,
  gatewayAuthentication: unknown,
  externalConnectors: ExternalConnectorRepository = externalConnectorRepository,
  /**
   * Tests only: how the external connector adapter resolves hosts, sends
   * and signs. Production uses the defaults: the system resolver, the
   * pinned HTTPS transport and the configured signer.
   */
  externalAdapter: Pick<
    GatewayExternalAdapterOptions,
    "lookup" | "transport" | "signer" | "keyId"
  > = {},
): ConnectorRegistry {
  const registrations: GatewayConnectorRegistration[] = [];

  const crypto = CryptoBootstrap.create();

  const testFixtureConnector = createTestFixtureConnector();

  if (testFixtureConnector !== undefined) {
    registrations.push({
      connector: testFixtureConnector,

      metadata: {
        connectorId: "test-fixture",
        displayName: "Test Fixture",
        version: {
          major: 1,
          minor: 0,
          patch: 0,
        },
        health: {
          status: "healthy",
          checkedAt: new Date().toISOString(),
        },
      },

      connectorIdentity: {
        connectorId: "test-fixture",
        publicIdentity: "spiffe://parmana/connectors/test-fixture",
        authenticationMetadata: {},
      },

      credentialProvider: new StaticCredentialProvider({
        "test-fixture": { token: "test-fixture-token" },
      }),

      policy: new DefaultConnectorPolicy(authenticator, sessions),

      gatewayAuthentication,

      crypto,

      audit,
    });
  }

  warnIfHubSpotTokenStale();

  const hubspotCredentialProvider = createHubSpotCredentialProvider();

  if (hubspotCredentialProvider === undefined) {
    console.warn({
      event: "hubspot_connector_unavailable",
      reason: "HUBSPOT_PRIVATE_APP_TOKEN is not configured.",
    });
  } else {
    registrations.push({
      connector: createHubSpotConnector(),

      metadata: HubSpotMetadata,

      connectorIdentity: {
        connectorId: "hubspot",
        publicIdentity: "spiffe://parmana/connectors/hubspot",
        authenticationMetadata: {},
      },

      credentialProvider: hubspotCredentialProvider,

      policy: new DefaultConnectorPolicy(authenticator, sessions),

      gatewayAuthentication,

      crypto,

      audit,
    });
  }

  assertConnectorCapabilitiesBound(registrations);

  // ADR-0013: a capability no built in connector serves may be registered
  // as an external connector. Its registration is read at every request
  // and its connector built once per registration, through the same
  // policy, session credential and audit path as the connectors above.
  // It holds no credential: the release is authenticated by its
  // signature, so the credential handle is empty.
  return new ExternalConnectorAwareRegistry(
    createGatewayConnectorRegistry(registrations),
    {
      findActive: async (
        capability: string,
      ): Promise<ActiveExternalConnector | null> => {
        const active = await externalConnectors.findActive(capability);

        return active === null
          ? null
          : {
              registrationId: active.registrationId,
              capability: active.capability,
              endpointUrl: active.endpointUrl,
              allowedParameters: active.allowedParameters,
              timeoutMs: active.timeoutMs,
            };
      },

      build: (registration) => {
        const identity = externalConnectorIdentity(registration.capability);

        return {
          connector: new GatewayExternalAdapter({
            ...externalAdapter,
            target: registration,
          }),

          metadata: {
            connectorId: identity.connectorId,
            displayName: `External connector for ${registration.capability}`,
            version: { major: 1, minor: 0, patch: 0 },
            health: {
              status: "healthy",
              checkedAt: new Date().toISOString(),
            },
          },

          connectorIdentity: identity,

          credentialProvider: new StaticCredentialProvider({
            [identity.connectorId]: {},
          }),

          policy: new DefaultConnectorPolicy(authenticator, sessions),

          gatewayAuthentication,

          crypto,

          audit,

          timeoutMs: registration.timeoutMs,
        };
      },
    },
  );
}
