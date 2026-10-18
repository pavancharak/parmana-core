export interface GatewayAuthentication {
  readonly version: number;

  readonly gatewayId: string;

  readonly issuedAt: string;

  readonly expiresAt: string;

  readonly nonce: string;
}
