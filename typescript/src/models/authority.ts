/**
 * Parmana Authority.
 *
 * Human or system authority responsible
 * for authorizing execution.
 */

export interface Authority {
  readonly authorityId: string;

  readonly authorityType: string;

  readonly principalId: string;

  readonly displayName?: string;

  readonly issuedAt: Date;
}
