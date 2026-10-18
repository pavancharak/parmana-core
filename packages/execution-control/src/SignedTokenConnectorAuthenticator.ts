import type { KeyObject } from "node:crypto";

import {
  isGatewayAttestation,
  verifyGatewayAttestationSignature,
  type GatewayAttestation,
} from "./GatewayAttestation.js";
import { isExternalConnectorIdentity } from "./externalConnectorIdentity.js";

import type {
  ConnectorAuthenticator,
  ConnectorIdentity,
  GatewayIdentity,
} from "./types.js";

/**
 * Extends ConnectorAuthenticator with a request-bound check. Callers that
 * can supply the authorizationId of the request being authorized MUST use
 * authenticateGatewayForRequest — the interface-required
 * authenticateGateway() has no way to receive it, so it cannot rule out a
 * stale attestation being replayed against a different request.
 */
export interface RequestBoundConnectorAuthenticator extends ConnectorAuthenticator {
  authenticateGatewayForRequest(
    identity: GatewayIdentity,
    authentication: unknown,
    authorizationId: string,
  ): boolean;
}

/**
 * Verifies a signed GatewayAttestation instead of comparing an opaque
 * value by reference/equality (see InMemoryConnectorAuthenticator).
 */
export class SignedTokenConnectorAuthenticator implements RequestBoundConnectorAuthenticator {
  constructor(
    private readonly gateway: GatewayIdentity,
    private readonly gatewayPublicKey: KeyObject,
    private readonly connectorIdentities: readonly ConnectorIdentity[],
    /**
     * Also trust the identity form external connectors are built with
     * (externalConnectorIdentity). They are built by the server itself
     * for an approved registration (ADR-0013), so their set is not known
     * at startup.
     */
    private readonly trustExternalConnectors = false,
  ) {}

  authenticateGateway(
    identity: GatewayIdentity,
    authentication: unknown,
  ): boolean {
    return this.verifiedAttestation(identity, authentication) !== undefined;
  }

  authenticateGatewayForRequest(
    identity: GatewayIdentity,
    authentication: unknown,
    authorizationId: string,
  ): boolean {
    const attestation = this.verifiedAttestation(identity, authentication);
    return (
      attestation !== undefined &&
      attestation.payload.authorizationId === authorizationId
    );
  }

  authenticateConnector(identity: ConnectorIdentity): boolean {
    if (this.trustExternalConnectors && isExternalConnectorIdentity(identity)) {
      return true;
    }

    return this.connectorIdentities.some(
      (trusted) =>
        trusted.connectorId === identity.connectorId &&
        trusted.publicIdentity === identity.publicIdentity,
    );
  }

  private verifiedAttestation(
    identity: GatewayIdentity,
    authentication: unknown,
  ): GatewayAttestation | undefined {
    if (
      identity.gatewayId !== this.gateway.gatewayId ||
      identity.publicIdentity !== this.gateway.publicIdentity
    ) {
      return undefined;
    }
    if (!isGatewayAttestation(authentication)) return undefined;
    if (authentication.payload.gatewayId !== this.gateway.gatewayId)
      return undefined;
    if (
      !verifyGatewayAttestationSignature(authentication, this.gatewayPublicKey)
    )
      return undefined;
    return authentication;
  }
}
