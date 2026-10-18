/**
 * Parmana Trust Core
 *
 * Authority
 *
 * Represents the entity empowered to authorize
 * execution within a trust domain.
 *
 * Authority is immutable once issued.
 */
export interface Authority {
  /**
   * Unique Authority identifier.
   */
  readonly authorityId: string;

  /**
   * Type of authority.
   */
  readonly authorityType: AuthorityType;

  /**
   * Principal identifier.
   */
  readonly principalId: string;

  /**
   * Human-readable display name.
   */
  readonly displayName?: string;

  /**
   * UTC timestamp when Authority became effective.
   */
  readonly issuedAt: Date;
}

/**
 * Supported Authority types.
 */
export enum AuthorityType {
  USER = "USER",

  ROLE = "ROLE",

  SERVICE = "SERVICE",

  ORGANIZATION = "ORGANIZATION",
}
