/**
 * Parmana Trust Core
 *
 * Authorization
 *
 * Immutable trust artifact proving that an Authority
 * granted approval for an intended execution.
 *
 * Authorization is part of the canonical
 * Execution Trust Chain.
 *
 * Authority
 *      ↓
 * Authorization
 *      ↓
 * Intent
 *      ↓
 * Policy
 *      ↓
 * Decision
 */
export interface Authorization {
  /**
   * Unique Authorization identifier.
   */
  readonly authorizationId: string;

  /**
   * Authority issuing this Authorization.
   */
  readonly authorityId: string;

  /**
   * Business purpose for which the Authorization
   * was granted.
   *
   * Examples:
   * - Approve vendor payment
   * - Authorize production deployment
   * - Approve account closure
   */
  readonly purpose: string;

  /**
   * UTC timestamp when the Authorization
   * was issued.
   */
  readonly issuedAt: Date;

  /**
   * Optional expiration timestamp.
   *
   * After this time the Authorization
   * is no longer valid.
   */
  readonly expiresAt?: Date;
}
