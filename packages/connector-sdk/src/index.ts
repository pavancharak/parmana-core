/**
 * @parmana/connector-sdk
 *
 * Canonical public API.
 *
 * Connector authoring contracts: capability definitions, schemas, DTOs,
 * metadata, and the Connector/CredentialProvider interfaces. Passive by
 * design — this package describes capabilities, it does not execute them.
 * Production execution (registration, credential-backed dispatch, the
 * concrete Connector implementations) is owned by @parmana/execution-gateway
 * (Phase 1C).
 */

export * from "./ConnectorTypes.js";
export * from "./ConnectorMetadata.js";
export * from "./ConnectorFactory.js";
export * from "./CredentialProvider.js";
export * from "./MockConnector.js";

// Four enterprise-named reference mocks: deterministic MockConnector
// instances shaped like a real integration, not real integrations. See
// each connector's own Metadata export for what capability it declares.
export * from "./connectors/oracle/index.js";
export * from "./connectors/salesforce/index.js";
export * from "./connectors/sap/index.js";
export * from "./connectors/workday/index.js";
