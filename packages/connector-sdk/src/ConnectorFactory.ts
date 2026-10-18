import type { Connector } from "./ConnectorTypes.js";

/**
 * Constructs a Connector from configuration.
 *
 * Future connectors (Stripe, GitHub, Salesforce, SAP, ServiceNow, Workday,
 * Slack, Jira, Database — all [FUTURE]) implement this interface. No
 * concrete enterprise factory is implemented in this milestone; only the
 * seam is defined so those connectors have a single, consistent
 * construction contract to target.
 */
export interface ConnectorFactory<TConfig = unknown> {
  readonly connectorType: string;
  create(config: TConfig): Connector;
}
