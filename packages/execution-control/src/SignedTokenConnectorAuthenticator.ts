import type { KeyObject } from "node:crypto";

import {
  isGatewayAttestation,
  verifyGatewayAttestationSignature,
  type GatewayAttestation,
} from "./GatewayAttestation.js";
import { SystemClock, type Clock } from "./Clock.js";

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

  /**
   * An authenticator with the same gateway trust that trusts exactly the
   * given connector identities and nothing else. A connector built for one
   * registration is given the scope of its own identity, so no other
   * identity, even one of the same form, passes its policy.
   */
  scopedTo(
    connectorIdentities: readonly ConnectorIdentity[],
  ): RequestBoundConnectorAuthenticator;
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
    /** Source of the time for the attestation expiry check. */
    private readonly clock: Clock = new SystemClock(),
  ) {}

  scopedTo(
    connectorIdentities: readonly ConnectorIdentity[],
  ): SignedTokenConnectorAuthenticator {
    return new SignedTokenConnectorAuthenticator(
      this.gateway,
      this.gatewayPublicKey,
      connectorIdentities,
      this.clock,
    );
  }

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
    // Expired attestations are refused, with no grace period. The check runs
    // before the signature so a stale attestation is refused without any
    // work on the key. An unparseable expiry is refused too.
    const expiresAt = Date.parse(authentication.payload.expiresAt);
    if (!Number.isFinite(expiresAt) || this.clock.now().getTime() >= expiresAt)
      return undefined;
    if (
      !verifyGatewayAttestationSignature(authentication, this.gatewayPublicKey)
    )
      return undefined;
    return authentication;
  }
}
