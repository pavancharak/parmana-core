/**
 * Authority grants (RFC-0023 phase 3): which API key may have which
 * capability decided, within which limits, until when, made through maker
 * checker. They matter for a policy with requireAuthorityGrant; GET
 * /policies/in-effect says so with authorityGrantRequired.
 */

import type { PendingPolicyChangeStatus } from "./policy-change.js";

/**
 * A limit on one place in the request. `min` and `max` apply to a number
 * there, inclusive; `oneOf` lists the only values allowed there.
 */
export interface AuthorityGrantLimit {
  readonly min?: number;
  readonly max?: number;
  readonly oneOf?: readonly (string | number)[];
}

/**
 * Limits by Intent path: `target` or `parameters.<name>`.
 */
export type AuthorityGrantLimits = Readonly<
  Record<string, AuthorityGrantLimit>
>;

/**
 * A grant, active or revoked.
 */
export interface AuthorityGrant {
  /**
   * The changeId of the approved grant change that created it.
   */
  readonly grantId: string;

  /**
   * The callerId of the API key the grant is for.
   */
  readonly callerId: string;
  readonly capability: string;
  readonly limits?: AuthorityGrantLimits;
  readonly validFrom: string;

  /**
   * After this, requests are refused as AUTHORITY_EXPIRED.
   */
  readonly validUntil: string;

  /**
   * At most one active grant per caller and capability.
   */
  readonly status: "active" | "revoked";
  readonly grantedAt: string;
  readonly revokedByChangeId?: string;
  readonly revokedAt?: string;
}

/**
 * A proposal to grant or revoke authority, and its resolution.
 */
export interface AuthorityGrantChange {
  /**
   * Sign the step up authorization for approve or reject with this id as
   * `pendingPolicyChangeId`.
   */
  readonly changeId: string;
  readonly action: "grant" | "revoke";
  readonly callerId: string;
  readonly capability: string;
  readonly limits?: AuthorityGrantLimits;
  readonly validFrom?: string;
  readonly validUntil?: string;
  readonly reason: string;
  readonly proposedBy: string;
  readonly proposedAt: string;
  readonly status: PendingPolicyChangeStatus;
  readonly resolvedBy?: string;
  readonly resolvedAt?: string;
  readonly rejectionReason?: string;
}

/**
 * What proposeAuthorityGrantChange() sends.
 */
export type ProposeAuthorityGrantChangeInput =
  | {
      readonly action: "grant";
      /**
       * The callerId of the agent's API key. Not your own.
       */
      readonly callerId: string;
      /**
       * namespace:verb.
       */
      readonly capability: string;
      readonly limits?: AuthorityGrantLimits;
      /**
       * ISO 8601. Defaults to the approval time.
       */
      readonly validFrom?: string;
      /**
       * ISO 8601, in the future, at most 366 days after validFrom.
       */
      readonly validUntil: string;
      readonly reason: string;
    }
  | {
      readonly action: "revoke";
      readonly callerId: string;
      readonly capability: string;
      readonly reason: string;
    };
