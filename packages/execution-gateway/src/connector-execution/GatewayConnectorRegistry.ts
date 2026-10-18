import type { CryptoProvider } from "@parmana/crypto";
import {
  InMemoryConnectorRegistry,
  InMemorySecureConnector,
  InMemorySessionCredentialVault,
  RandomIdGenerator,
  SessionCredentialSecureConnector,
  SystemClock,
  type Clock,
  type ConnectorIdentity,
  type ConnectorPolicy,
  type ConnectorRegistry,
  type ExecutionAuditSink,
  type IdGenerator,
  type SecureConnector,
} from "@parmana/execution-control";

import { ConnectorNotRegisteredError } from "@parmana/shared";

import type { Connector } from "@parmana/connector-sdk";
import { CredentialVaultAdapter } from "./CredentialVaultAdapter.js";
import type { CredentialProvider } from "@parmana/connector-sdk";
import type {
  ConnectorMetadata,
  ConnectorVersion,
} from "@parmana/connector-sdk";
import { SdkConnectorExecutor } from "./SdkConnectorExecutor.js";

const DEFAULT_SESSION_CREDENTIAL_LIFETIME_MS = 30_000;

export interface ConnectorRegistrationOptions {
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
   * Opts this one connector OUT of session-credential isolation, back to
   * the raw, always-resolvable InMemoryCredentialVault path (no audit
   * requirement, no per-execution session credential). For tests only —
   * every production connector goes through the default, session-
   * credential path.
   */
  readonly legacyInsecure?: boolean;
}

export interface ConnectorRegistryEntry {
  readonly connector: Connector;
  readonly metadata: ConnectorMetadata;
  readonly secureConnector: SecureConnector;
}

/**
 * ExecutionGateway's canonical connector registry: connector-authoring
 * ergonomics (metadata, versioning, health, credential-provider wiring) on
 * top of execution-control's ConnectorRegistry.
 *
 * Implements execution-control's ConnectorRegistry interface (`get`) by
 * composing an InMemoryConnectorRegistry internally — the existing registry
 * class is used, not modified, and remains a valid drop-in wherever a plain
 * ConnectorRegistry is expected (e.g. ExecutionControlService).
 */
export class GatewayConnectorRegistry implements ConnectorRegistry {
  private readonly inner = new InMemoryConnectorRegistry();
  private readonly entries = new Map<string, ConnectorRegistryEntry>();

  register(options: ConnectorRegistrationOptions): void {
    const connectorId = options.connector.connectorId;
    if (this.entries.has(connectorId)) {
      throw new Error(`Connector already registered: ${connectorId}.`);
    }

    const secureConnector = buildSecureConnector(options);

    this.inner.register(secureConnector);
    this.entries.set(connectorId, {
      connector: options.connector,
      metadata: options.metadata,
      secureConnector,
    });
  }

  /** Satisfies execution-control's ConnectorRegistry interface, unchanged behavior. */
  get(name: string): SecureConnector {
    return this.inner.get(name);
  }

  resolveCapability(capability: string): SecureConnector {
    for (const entry of this.entries.values()) {
      if (entry.secureConnector.capabilities.includes(capability)) {
        return entry.secureConnector;
      }
    }

    throw new ConnectorNotRegisteredError(capability);
  }

  entry(name: string): ConnectorRegistryEntry {
    const entry = this.entries.get(name);
    if (entry === undefined) throw new Error(`Unknown connector: ${name}.`);
    return entry;
  }

  list(): readonly ConnectorRegistryEntry[] {
    return [...this.entries.values()];
  }
}

/**
 * The secure connector that executes a registration: the connector
 * behind its SDK executor, credential vault, policy and, unless
 * legacyInsecure, a single use session credential and the audit sink.
 * Used for every built in connector (GatewayConnectorRegistry.register)
 * and for each external connector built at request time
 * (ExternalConnectorAwareRegistry).
 */
export function buildSecureConnector(
  options: ConnectorRegistrationOptions,
): SecureConnector {
  const executor = new SdkConnectorExecutor({
    connector: options.connector,
    metadata: options.metadata,
    credentialProviderId: options.credentialProvider.providerId,
    crypto: options.crypto,
    ...(options.expectedVersion !== undefined
      ? { expectedVersion: options.expectedVersion }
      : {}),
    ...(options.timeoutMs !== undefined
      ? { timeoutMs: options.timeoutMs }
      : {}),
  });

  const credentialVault = new CredentialVaultAdapter(
    options.credentialProvider,
  );

  if (options.legacyInsecure === true) {
    //
    // legacyInsecure skips the single-use session credential and the audit
    // requirement. It exists only for tests; a production process must not
    // be able to run connectors that way.
    //
    if (process.env.NODE_ENV !== "test") {
      throw new Error(
        `Connector "${options.connector.connectorId}" was registered with legacyInsecure: true, ` +
          "which is refused outside NODE_ENV=test.",
      );
    }

    return new InMemorySecureConnector({
      identity: options.connectorIdentity,
      capabilities: options.connector.capabilities.declared,
      policy: options.policy,
      gatewayAuthentication: options.gatewayAuthentication,
      credentialVault,
      executor,
    });
  } else {
    if (options.audit === undefined) {
      throw new Error(
        `Connector "${options.connector.connectorId}" registration requires an ExecutionAuditSink — the ` +
          `same instance ExecutionControlService writes to, per the single-audit-trail ` +
          `requirement — unless legacyInsecure: true is explicitly set.`,
      );
    }

    const clock = options.clock ?? new SystemClock();

    const sessionCredentials = new InMemorySessionCredentialVault({
      credentials: credentialVault,
      clock,
      idGenerator: options.idGenerator ?? new RandomIdGenerator(),
      lifetimeMs:
        options.sessionCredentialLifetimeMs ??
        DEFAULT_SESSION_CREDENTIAL_LIFETIME_MS,
    });

    return new SessionCredentialSecureConnector({
      identity: options.connectorIdentity,
      capabilities: options.connector.capabilities.declared,
      policy: options.policy,
      gatewayAuthentication: options.gatewayAuthentication,
      sessionCredentials,
      executor,
      audit: options.audit,
      clock,
    });
  }
}
