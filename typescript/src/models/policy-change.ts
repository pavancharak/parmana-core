/**
 * Policy governance: a proposed change to a policy, and the signed step up
 * authorization an approver sends to approve or reject it.
 *
 * Mirrors packages/shared/src/domain/pending-policy-change.ts and
 * policy-change-step-up-authorization.ts, and the response bodies of the
 * /policies/.../pending-changes routes (packages/api/src/routes/
 * pending-policy-changes.ts).
 */

/**
 * Where a proposed policy change is in its review.
 */
export type PendingPolicyChangeStatus =
  "PENDING_APPROVAL" | "APPROVED" | "REJECTED";

/**
 * A proposed change to a policy. One person proposes it and a different
 * person approves or rejects it.
 */
export interface PendingPolicyChange {
  readonly pendingPolicyChangeId: string;
  readonly policyName: string;
  readonly policyVersion: string;

  /**
   * The full policy content that takes effect when the change is approved.
   */
  readonly proposedContent: unknown;

  /**
   * Caller ID of the proposer.
   */
  readonly proposedBy: string;

  /**
   * ISO 8601 timestamp.
   */
  readonly proposedAt: string;

  readonly status: PendingPolicyChangeStatus;
  readonly reason: string;

  /**
   * Caller ID of whoever approved or rejected it. Absent while pending.
   */
  readonly resolvedBy?: string;

  /**
   * ISO 8601 timestamp. Absent while pending.
   */
  readonly resolvedAt?: string;

  /**
   * Present only on a rejected change.
   */
  readonly rejectionReason?: string;
}

/**
 * A policy change as listed for review: the change, plus the content in
 * effect now next to the proposed content, and any warnings the policy
 * validator raised about the proposal.
 */
export interface PolicyChangeForReview extends PendingPolicyChange {
  readonly diff: {
    /**
     * The content in effect now, or null for a policy version that has
     * none yet.
     */
    readonly current: unknown;
    readonly proposed: unknown;
  };
  readonly coverageWarnings?: readonly unknown[];
  readonly ruleConflicts?: readonly unknown[];
}

/**
 * The body of POST /policies/{name}/{version}/pending-changes.
 */
export interface ProposePolicyChangeInput {
  /**
   * The whole policy.json content. Its `policyId` must equal the policy
   * name in the URL.
   */
  readonly proposedContent: unknown;

  /**
   * Why the change should take effect. Required.
   */
  readonly reason: string;
}

/**
 * A proposal as returned when it is created, with any validator warnings.
 */
export interface ProposedPolicyChange extends PendingPolicyChange {
  readonly coverageWarnings?: readonly unknown[];
  readonly ruleConflicts?: readonly unknown[];
}

/**
 * The signed part of a step up authorization.
 */
export interface PolicyChangeStepUpAuthorizationPayload {
  readonly version: 1;
  readonly nonce: string;
  readonly pendingPolicyChangeId: string;
  readonly action: "approve" | "reject";

  /**
   * ISO 8601 timestamp.
   */
  readonly authorizedAt: string;

  /**
   * ISO 8601 timestamp.
   */
  readonly expiresAt: string;
}

/**
 * Proof that the approver, holding their step up private key, authorized
 * this one action on this one change. Valid once, until `expiresAt`.
 * Make one with `signPolicyChangeStepUp()`.
 */
export interface PolicyChangeStepUpAuthorization {
  readonly payload: PolicyChangeStepUpAuthorizationPayload;

  /**
   * Base64 Ed25519 signature over the canonical JSON of `payload`.
   */
  readonly signature: string;

  readonly keyId: string;
  readonly algorithm: "ed25519";
}
