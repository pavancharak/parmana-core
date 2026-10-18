import type {
  ConnectorPolicy,
  GatewayExecutionRequest,
  SecureConnector,
} from "@parmana/execution-control";

import { isNamespacedCapability } from "@parmana/connector-sdk";

/**
 * Wraps an existing execution-control ConnectorPolicy (typically
 * DefaultConnectorPolicy, unchanged) with one additional, side-effect-free
 * check: the requested capability must be a namespaced verb. This runs
 * before delegating so a malformed capability never reaches session
 * consumption or credential resolution.
 *
 * Composition, not reimplementation — authentication, trusted-connector,
 * verified-transaction, capability-declared, and one-time-session checks all
 * remain exactly DefaultConnectorPolicy's, unchanged.
 */
export class GatewayCapabilityConnectorPolicy implements ConnectorPolicy {
  constructor(private readonly inner: ConnectorPolicy) {}

  async assertAllowed(
    request: GatewayExecutionRequest,
    connector: SecureConnector,
    authentication: unknown,
  ): Promise<void> {
    if (!isNamespacedCapability(request.executableContent.action)) {
      throw new Error(
        `Connector capability "${request.executableContent.action}" is not a namespaced verb ` +
          `(expected a form like "crm:read").`,
      );
    }
    await this.inner.assertAllowed(request, connector, authentication);
  }
}
