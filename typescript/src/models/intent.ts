/**
 * Parmana Intent.
 *
 * Business intent.
 */

export interface Intent {
  readonly intentId: string;

  readonly authorizationId: string;

  readonly action: string;

  readonly target: string;

  readonly parameters: Record<string, unknown>;

  readonly createdAt: Date;
}
