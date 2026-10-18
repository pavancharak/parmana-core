/**
 * Connector Catalog.
 *
 * Defines the set of Secure Connectors that should be
 * available in the current Parmana deployment.
 *
 * This file contains no construction logic.
 * It only describes which connectors are enabled.
 *
 * Future implementations may load this information from:
 *
 * - Configuration
 * - Database
 * - Feature Flags
 * - Plugin Discovery
 * - Enterprise Licensing
 */

export interface ConnectorDefinition {
  /**
   * Unique connector identifier.
   */
  readonly id: string;

  /**
   * Human-readable connector name.
   */
  readonly displayName: string;

  /**
   * Whether this connector should be registered.
   */
  readonly enabled: boolean;
}

/**
 * Production connector catalog.
 *
 * Add every supported enterprise connector here.
 */
export const ConnectorCatalog: readonly ConnectorDefinition[] = Object.freeze([
  Object.freeze({
    id: "stripe",
    displayName: "Stripe",
    enabled: false,
  }),

  Object.freeze({
    id: "salesforce",
    displayName: "Salesforce",
    enabled: false,
  }),

  Object.freeze({
    id: "sap",
    displayName: "SAP",
    enabled: false,
  }),

  Object.freeze({
    id: "servicenow",
    displayName: "ServiceNow",
    enabled: false,
  }),

  Object.freeze({
    id: "slack",
    displayName: "Slack",
    enabled: false,
  }),

  Object.freeze({
    id: "jira",
    displayName: "Jira",
    enabled: false,
  }),

  Object.freeze({
    id: "github",
    displayName: "GitHub",
    enabled: false,
  }),
]);
