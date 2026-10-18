/**
 * Parmana Trust Core
 *
 * Intent
 *
 * Immutable declaration of the action that an
 * Authority intends to be executed under an
 * Authorization.
 *
 * Intent is evaluated by Policy but is never
 * modified by Policy.
 *
 * Trust Chain:
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
 *      ↓
 * Execution
 */
export interface Intent {
  /**
   * Unique Intent identifier.
   */
  readonly intentId: string;

  /**
   * Authorization under which this
   * Intent was created.
   */
  readonly authorizationId: string;

  /**
   * Business action being requested.
   *
   * Examples:
   * - TransferFunds
   * - ApproveInvoice
   * - DeployApplication
   */
  readonly action: string;

  /**
   * Target of the intended action.
   *
   * Examples:
   * - account/12345
   * - invoice/INV-1001
   * - service/payment-api
   */
  readonly target: string;

  /**
   * Immutable business parameters
   * describing the intended action.
   */
  readonly parameters: Readonly<Record<string, unknown>>;

  /**
   * UTC timestamp when the Intent
   * was created.
   */
  readonly createdAt: Date;
}
