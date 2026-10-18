/**
 * Input claims used when issuing a Gateway
 * Authentication token.
 */
export interface GatewayAuthenticationClaims {
  readonly gatewayId: string;

  readonly sessionId: string;

  readonly ttlSeconds: number;
}
