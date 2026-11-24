import {
  SignedTokenConnectorAuthenticator,
  type RequestBoundConnectorAuthenticator,
} from "@parmana/execution-control";

import { createGatewayIdentity } from "./createGatewayIdentity.js";
import { createGatewayKeyPair } from "./createGatewayKeyPair.js";
import { localModeEnabled } from "./localMode.js";

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
    // The test-fixture identity is trusted only in local mode. Production
    // trusts no built-in connector identity: a fixture identity left in a
    // production bootstrap is a trusted identity nobody reviews.
    localModeEnabled()
      ? [
          {
            connectorId: "test-fixture",
            publicIdentity: "spiffe://parmana/connectors/test-fixture",
            authenticationMetadata: {},
          },
        ]
      : [],
  );
}
