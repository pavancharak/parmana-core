import {
  SignedTokenConnectorAuthenticator,
  type RequestBoundConnectorAuthenticator,
} from "@parmana/execution-control";

import { createGatewayIdentity } from "./createGatewayIdentity.js";
import { createGatewayKeyPair } from "./createGatewayKeyPair.js";

/**
 * Creates the ConnectorAuthenticator used by
 * ExecutionControlService.
 *
 * Trusted connector identities are configured here.
 * This file must not depend on the ConnectorRegistry,
 * otherwise a circular dependency is created.
 *
 * Verifies a real signed Gateway attestation (SignedTokenConnectorAuthenticator)
 * instead of comparing an opaque shared value by reference.
 */
export function createConnectorAuthenticator(): RequestBoundConnectorAuthenticator {
  const gatewayIdentity = createGatewayIdentity();

  const { publicKey } = createGatewayKeyPair();

  return new SignedTokenConnectorAuthenticator(
    gatewayIdentity,
    publicKey,
    [
      {
        connectorId: "test-fixture",
        publicIdentity: "spiffe://parmana/connectors/test-fixture",
        authenticationMetadata: {},
      },
      {
        connectorId: "hubspot",
        publicIdentity: "spiffe://parmana/connectors/hubspot",
        authenticationMetadata: {},
      },
      {
        connectorId: "github",
        publicIdentity: "spiffe://parmana/connectors/github",
        authenticationMetadata: {},
      },
      {
        connectorId: "paytm",
        publicIdentity: "spiffe://parmana/connectors/paytm-refund",
        authenticationMetadata: {},
      },
      {
        connectorId: "slack",
        publicIdentity: "spiffe://parmana/connectors/slack",
        authenticationMetadata: {},
      },
    ],
    // External connectors (ADR-0013) are built by the server for approved
    // registrations, so their identities are not known at startup.
    true,
  );
}
