/**
 * Canonical Gateway Authentication payload.
 *
 * Authenticates the Execution Gateway to
 * Execution Control and Connectors.
 */
export interface GatewayAuthenticationPayload {
  readonly version: 1;

  readonly gatewayId: string;

  readonly sessionId: string;

  readonly issuedAt: string;

  readonly expiresAt: string;

  readonly nonce: string;
}
