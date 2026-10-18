/**
 * Parmana Authorization.
 *
 * Authorization granted by an Authority.
 */

export interface Authorization {
  readonly authorizationId: string;

  readonly authorityId: string;

  readonly purpose: string;

  readonly issuedAt: Date;

  readonly expiresAt?: Date;
}
