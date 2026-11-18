/**
 * Parmana SDK
 *
 * Policy version 2 models.
 *
 * These mirror the server's policy version 2 responses. They are the SDK's
 * contract, not the server's source. Policy version 2 is not enabled on every
 * deployment: a call for a capability the deployment has not enabled is
 * refused with HTTP 404 and the error code not_enabled.
 */

/** The outcome of a policy version 2 decision. */
export type PolicyV2Outcome = "APPROVE" | "REJECT" | "REVIEW";

/** The refusals that happen before any rule runs. Each one refuses the request. */
export type PolicyV2RefusalCode =
  | "NO_APPROVED_POLICY"
  | "POLICY_INVALID"
  | "SOURCE_UNAVAILABLE"
  | "SOURCE_NOT_VERIFIED"
  | "STALE"
  | "INVALID"
  | "MISSING_VALUE"
  | "THRESHOLD_NOT_APPROVED";

/** One failed check of a policy, as the policy validator reports it. */
export interface PolicyV2ValidationError {
  /** The check number in the policy version 2 specification. 0 means structure. */
  readonly check: number;
  readonly path: string;
  readonly message: string;
}

export interface PolicyV2Refusal {
  readonly code: PolicyV2RefusalCode;
  readonly detail: string;
  readonly errors?: readonly PolicyV2ValidationError[];
}

/**
 * A decision request. The capability is namespace:verb, for example
 * erp:pay-invoice. Signals are caller values, untrusted unless a registered
 * source signed them. Approvals are approval artifacts, checked by the server.
 */
export interface PolicyV2DecisionRequest {
  readonly capability: string;
  readonly transactionId: string;
  readonly target: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly signals?: Readonly<Record<string, unknown>>;
  readonly approvals?: Readonly<Record<string, unknown>>;
}

/**
 * The recorded decision. released is always false: a policy version 2
 * decision never releases anything by itself. A REVIEW outcome carries a
 * reviewId; read the review with policyV2Review until it is final.
 */
export interface PolicyV2Decision {
  readonly outcome: PolicyV2Outcome;
  readonly reason: string;
  readonly tier?: string;
  readonly refusal?: PolicyV2Refusal;
  readonly recordId: string;
  readonly released: false;
  readonly reviewId?: string;
}

/** The status of a review item, as its requester sees it. */
export type PolicyV2ReviewStatus =
  "pending" | "approved" | "refused" | "expired";

export type PolicyV2ReviewReason =
  "UNDER_REVIEW" | "REVIEW_APPROVED" | "REVIEW_REFUSED" | "REVIEW_EXPIRED";

/** A review item as its requester sees it. */
export interface PolicyV2ReviewView {
  readonly status: PolicyV2ReviewStatus;
  readonly reasonCode: PolicyV2ReviewReason;
}

/** What a reviewer decides on a review item. */
export type PolicyV2ReviewDecisionValue = "approve" | "reject";

/** The result of a reviewer's decision. */
export interface PolicyV2ReviewDecision {
  readonly itemId: string;
  readonly status: string;
  /** True once the review is finished. outcome is set then. */
  readonly final: boolean;
  readonly outcome?: "APPROVED" | "REFUSED";
  readonly decisionsRecorded: number;
}
