import type { ConnectorIdentity } from "./types.js";

const EXTERNAL_CONNECTOR_ID_PREFIX = "ext-";
const EXTERNAL_PUBLIC_IDENTITY_PREFIX = "spiffe://parmana/connectors/external/";

/**
 * The identity of the connector the server builds for an approved
 * external connector registration (ADR-0013): connector id
 * `ext-<capability>`, the id GatewayExternalAdapter uses, and a public
 * identity naming the same capability.
 */
export function externalConnectorIdentity(
  capability: string,
): ConnectorIdentity {
  return {
    connectorId: `${EXTERNAL_CONNECTOR_ID_PREFIX}${capability}`,
    publicIdentity: `${EXTERNAL_PUBLIC_IDENTITY_PREFIX}${capability}`,
    authenticationMetadata: {},
  };
}
