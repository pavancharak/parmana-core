import type { CryptoProvider } from "@parmana/crypto";
import type {
  Clock,
  ConnectorIdentity,
  ConnectorPolicy,
  ConnectorRegistry,
  ExecutionAuditSink,
  IdGenerator,
} from "@parmana/execution-control";

import type {
  Connector,
  ConnectorMetadata,
  ConnectorVersion,
  CredentialProvider,
} from "@parmana/connector-sdk";

import { GatewayCapabilityConnectorPolicy } from "./GatewayCapabilityConnectorPolicy.js";
import { GatewayConnectorRegistry } from "./GatewayConnectorRegistry.js";

/**
 * One connector's registration, for createGatewayConnectorRegistry.
 *
 * `policy` is the base ConnectorPolicy (typically DefaultConnectorPolicy,
 * unchanged) — GatewayCapabilityConnectorPolicy's namespaced-capability
 * check is applied internally, so callers never construct it themselves.
 */
export interface GatewayConnectorRegistration {
  readonly connector: Connector;
  readonly metadata: ConnectorMetadata;
  readonly connectorIdentity: ConnectorIdentity;
  readonly credentialProvider: CredentialProvider;
  readonly policy: ConnectorPolicy;
  readonly gatewayAuthentication: unknown;
  readonly crypto: CryptoProvider;

  /** See SdkConnectorExecutorOptions.expectedVersion. */
  readonly expectedVersion?: ConnectorVersion;
  readonly timeoutMs?: number;

  /**
   * Required unless legacyInsecure is true. Must be the SAME
   * ExecutionAuditSink instance ExecutionControlService writes to — a
   * private, per-registration sink would fragment the audit trail.
   */
  readonly audit?: ExecutionAuditSink;
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  readonly sessionCredentialLifetimeMs?: number;

  /**
   * Opts this one connector OUT of session-credential isolation. For tests
   * only — every production connector goes through the default,
   * session-credential path.
   */
  readonly legacyInsecure?: boolean;
}

/**
 * Builds the production ConnectorRegistry from a list of registrations.
 *
 * Constructs one GatewayConnectorRegistry, wraps each registration's policy
 * in GatewayCapabilityConnectorPolicy, and registers every entry — the same
 * sequence bootstrap code previously performed by importing both classes
 * directly. Returns execution-control's ConnectorRegistry interface (which
 * includes resolveCapability), not the concrete class, so callers never
 * need to reference GatewayConnectorRegistry or GatewayCapabilityConnectorPolicy.
 */
export function createGatewayConnectorRegistry(
  registrations: readonly GatewayConnectorRegistration[],
): ConnectorRegistry {
  const registry = new GatewayConnectorRegistry();

  for (const registration of registrations) {
    registry.register({
      ...registration,
      policy: new GatewayCapabilityConnectorPolicy(registration.policy),
    });
  }

  return registry;
}
