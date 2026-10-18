import type {
  ConnectorRegistry,
  SecureConnector,
} from "@parmana/execution-control";
import { ConnectorNotRegisteredError } from "@parmana/shared";

import type { ExternalConnectorTarget } from "./GatewayExternalAdapter.js";
import { GatewayCapabilityConnectorPolicy } from "./GatewayCapabilityConnectorPolicy.js";
import {
  buildSecureConnector,
  type ConnectorRegistrationOptions,
} from "./GatewayConnectorRegistry.js";

/**
 * An active external connector registration (ADR-0013), as the registry
 * needs it.
 */
export interface ActiveExternalConnector extends ExternalConnectorTarget {
  readonly registrationId: string;
}

export interface ExternalConnectorAwareRegistryOptions {
  /**
   * The active registration for a capability, or null. Read at every
   * resolution, so an approved registration or revocation applies to
   * the next request. A read error propagates: the release fails
   * closed.
   */
  readonly findActive: (
    capability: string,
  ) => Promise<ActiveExternalConnector | null>;

  /**
   * How to build the connector for a registration: the adapter, its
   * identity, credential provider, policy, audit sink and crypto. The
   * policy is wrapped in GatewayCapabilityConnectorPolicy here, as for
   * every built in connector.
   */
  readonly build: (
    registration: ActiveExternalConnector,
  ) => ConnectorRegistrationOptions;
}

/**
 * The connector registry the server uses once external connectors exist
 * (ADR-0013): the built in connectors first, unchanged; then, for a
 * capability none of them serves, the active external connector
 * registration for it, built once per registration and executed through
 * the same secure connector, session credential and audit path as a
 * built in connector. With neither, ConnectorNotRegisteredError, as
 * before.
 */
export class ExternalConnectorAwareRegistry implements ConnectorRegistry {
  private readonly built = new Map<string, SecureConnector>();

  constructor(
    private readonly builtIn: ConnectorRegistry,
    private readonly options: ExternalConnectorAwareRegistryOptions,
  ) {}

  get(name: string): SecureConnector {
    try {
      return this.builtIn.get(name);
    } catch (error) {
      for (const connector of this.built.values()) {
        if (connector.connectorId === name) {
          return connector;
        }
      }

      throw error;
    }
  }

  async resolveCapability(capability: string): Promise<SecureConnector> {
    try {
      return await this.builtIn.resolveCapability(capability);
    } catch (error) {
      if (!(error instanceof ConnectorNotRegisteredError)) {
        throw error;
      }
    }

    const registration = await this.options.findActive(capability);

    if (registration === null || registration.capability !== capability) {
      throw new ConnectorNotRegisteredError(capability);
    }

    const existing = this.built.get(registration.registrationId);

    if (existing !== undefined) {
      return existing;
    }

    const options = this.options.build(registration);
    const connector = buildSecureConnector({
      ...options,
      policy: new GatewayCapabilityConnectorPolicy(options.policy),
    });

    this.built.set(registration.registrationId, connector);

    return connector;
  }
}
