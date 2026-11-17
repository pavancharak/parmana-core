/**
 * Review for policy version 2 (design 4.6, 5.5 and 5.6).
 *
 * A decision that the policy sends to review opens a review item. The item is its
 * own record, and it refers back to the decision that opened it. Reviewers approve
 * or reject the exact value the source established; they cannot change it. A high-
 * value item needs two reviewers. An item that is not decided in its window expires
 * as REVIEW_EXPIRED, and is never approved by default. The final result is a separate
 * record that refers back to the item. The caller sees only a status and a reason code.
 *
 * Standalone. The runtime does not use it yet.
 */

import { viewDigest, type ApprovalView } from "./approvals.js";

/** The longest review window (design 5.6, decision D11). */
export const MAX_REVIEW_WINDOW_BUSINESS_DAYS = 3;

export type ReviewStatus =
  "open" | "assigned" | "approved" | "refused" | "expired";

export interface ReviewGrant {
  readonly reviewerId: string;
  readonly capability: string;
  /** The largest amount this reviewer may decide. Undefined means no amount limit. */
  readonly maxAmount?: number;
  readonly revoked: boolean;
}

export interface ReviewerDecision {
  readonly reviewerId: string;
  readonly decision: "approve" | "reject";
  readonly at: string;
}

export interface ReviewItem {
  readonly id: string;
  readonly capability: string;
  readonly target: string;
  readonly requester: string;
  /** Reference to the decision that opened the review: its policy hash and matched rule. */
  readonly decisionRef: {
    readonly policyHash: string;
    readonly matchedRuleId: string;
  };
  readonly reason: string;
  readonly view: ApprovalView;
  readonly digest: string;
  readonly highValue: boolean;
  readonly amount?: number;
  readonly requiredApprovals: number;
  readonly openedAt: string;
  readonly dueAt: string;
  readonly status: ReviewStatus;
  readonly assignedTo: readonly string[];
  readonly decisions: readonly ReviewerDecision[];
}

/** The final record of a review. It is separate from the item and refers back to it. */
export interface ReviewResult {
  readonly reviewId: string;
  readonly outcome: "APPROVED" | "REFUSED" | "EXPIRED";
  readonly decidedBy: readonly string[];
  readonly digest: string;
  readonly at: string;
}

export interface ReviewEvent {
  readonly at: string;
  readonly by: string;
  readonly event: string;
  readonly detail: string;
}

/** What the caller may see about a review: a status and a reason code, never the reviewers. */
export interface CallerView {
  readonly status: "pending" | "approved" | "refused" | "expired";
  readonly reasonCode:
    "UNDER_REVIEW" | "REVIEW_APPROVED" | "REVIEW_REFUSED" | "REVIEW_EXPIRED";
}

export interface OpenInput {
  readonly capability: string;
  readonly target: string;
  readonly requester: string;
  readonly decisionRef: {
    readonly policyHash: string;
    readonly matchedRuleId: string;
  };
  readonly reason: string;
  readonly view: ApprovalView;
  readonly highValue: boolean;
  readonly amount?: number;
  readonly windowBusinessDays: number;
}

/** Adds business days (Monday to Friday). Public holidays are not modelled, and are listed in the design as open. */
export function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from.getTime());
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

export class ReviewQueue {
  private readonly items = new Map<string, ReviewItem>();
  private readonly results = new Map<string, ReviewResult>();
  private readonly grants = new Map<string, ReviewGrant>();
  private readonly events: ReviewEvent[] = [];
  private readonly alerted = new Set<string>();
  private counter = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  // ---- Grants --------------------------------------------------------------

  /** Grants a reviewer the right to decide items for a capability, up to an amount. Granted by the Parmana owner. */
  grant(by: string, grant: Omit<ReviewGrant, "revoked">): void {
    this.grants.set(`${grant.capability}/${grant.reviewerId}`, {
      ...grant,
      revoked: false,
    });
    this.record(
      by,
      "grant.added",
      `${grant.reviewerId} for ${grant.capability}`,
    );
  }

  revokeGrant(by: string, reviewerId: string, capability: string): void {
    const key = `${capability}/${reviewerId}`;
    const existing = this.grants.get(key);
    if (existing !== undefined)
      this.grants.set(key, { ...existing, revoked: true });
    this.record(by, "grant.revoked", `${reviewerId} for ${capability}`);
  }

  // ---- Items ---------------------------------------------------------------

  /** Opens a review item for a decision the policy sent to review. */
  open(input: OpenInput): ReviewItem {
    if (
      !(input.windowBusinessDays > 0) ||
      input.windowBusinessDays > MAX_REVIEW_WINDOW_BUSINESS_DAYS
    ) {
      throw new Error(
        `The review window must be between 1 and ${MAX_REVIEW_WINDOW_BUSINESS_DAYS} business days.`,
      );
    }
    const openedAt = this.now();
    this.counter += 1;
    const id = `review-${this.counter}`;
    const item: ReviewItem = {
      id,
      capability: input.capability,
      target: input.target,
      requester: input.requester,
      decisionRef: input.decisionRef,
      reason: input.reason,
      view: input.view,
      digest: viewDigest(input.view),
      highValue: input.highValue,
      ...(input.amount !== undefined && { amount: input.amount }),
      requiredApprovals: input.highValue ? 2 : 1,
      openedAt: openedAt.toISOString(),
      dueAt: addBusinessDays(openedAt, input.windowBusinessDays).toISOString(),
      status: "open",
      assignedTo: [],
      decisions: [],
    };
    this.items.set(id, item);
    this.record(
      input.requester,
      "review.opened",
      `${id} for ${input.capability} ${input.target}`,
    );
    return item;
  }

  /** A reviewer decides. Approve or reject only; there is no way to change the value. */
  decide(
    id: string,
    reviewerId: string,
    decision: "approve" | "reject",
  ): ReviewItem | ReviewResult {
    if (decision !== "approve" && decision !== "reject") {
      throw new Error(
        "A reviewer may only approve or reject. The value cannot be changed.",
      );
    }
    const item = this.requireOpen(id);
    this.requireEligible(item, reviewerId);
    if (item.decisions.some((d) => d.reviewerId === reviewerId)) {
      throw new Error(`${reviewerId} has already decided this item.`);
    }
    const at = this.now().toISOString();
    const decisions = [...item.decisions, { reviewerId, decision, at }];
    const assignedTo = item.assignedTo.includes(reviewerId)
      ? item.assignedTo
      : [...item.assignedTo, reviewerId];
    this.record(reviewerId, "review.decided", `${id}: ${decision}`);

    if (decision === "reject") {
      return this.finish(item, "REFUSED", decisions, assignedTo, at);
    }
    const approvals = decisions.filter((d) => d.decision === "approve").length;
    if (approvals >= item.requiredApprovals) {
      return this.finish(item, "APPROVED", decisions, assignedTo, at);
    }
    const updated: ReviewItem = {
      ...item,
      decisions,
      assignedTo,
      status: "assigned",
    };
    this.items.set(id, updated);
    return updated;
  }

  /** A reviewer hands the item to a backup holding a grant for the same capability. */
  handover(id: string, fromReviewer: string, toReviewer: string): ReviewItem {
    const item = this.requireOpen(id);
    if (!item.assignedTo.includes(fromReviewer))
      throw new Error(`${fromReviewer} is not assigned to this item.`);
    this.requireEligible(item, toReviewer);
    const updated: ReviewItem = {
      ...item,
      assignedTo: item.assignedTo.map((r) =>
        r === fromReviewer ? toReviewer : r,
      ),
    };
    this.items.set(id, updated);
    this.record(fromReviewer, "review.handed-over", `${id} to ${toReviewer}`);
    return updated;
  }

  /**
   * Alerts due at this time. The half-window reminder fires once per item, and the
   * expiry closes any item past its window as REVIEW_EXPIRED. Nothing is approved by default.
   */
  sweep(): { reminders: string[]; expired: ReviewResult[] } {
    const nowMs = this.now().getTime();
    const reminders: string[] = [];
    const expired: ReviewResult[] = [];
    for (const item of [...this.items.values()]) {
      if (
        item.status === "approved" ||
        item.status === "refused" ||
        item.status === "expired"
      )
        continue;
      const opened = Date.parse(item.openedAt);
      const due = Date.parse(item.dueAt);
      if (nowMs >= due) {
        expired.push(
          this.finish(
            item,
            "EXPIRED",
            item.decisions,
            item.assignedTo,
            this.now().toISOString(),
          ),
        );
      } else if (
        nowMs >= opened + (due - opened) / 2 &&
        !this.alerted.has(item.id)
      ) {
        this.alerted.add(item.id);
        reminders.push(item.id);
        this.record(
          "system",
          "review.reminder",
          `${item.id} past half its window`,
        );
      }
    }
    return { reminders, expired };
  }

  // ---- Reading -------------------------------------------------------------

  get(id: string): ReviewItem | undefined {
    return this.items.get(id);
  }

  result(id: string): ReviewResult | undefined {
    return this.results.get(id);
  }

  /** What the caller may see: a status and a reason code. Never the reviewers or the item. */
  callerView(id: string): CallerView | undefined {
    const item = this.items.get(id);
    if (item === undefined) return undefined;
    switch (item.status) {
      case "approved":
        return { status: "approved", reasonCode: "REVIEW_APPROVED" };
      case "refused":
        return { status: "refused", reasonCode: "REVIEW_REFUSED" };
      case "expired":
        return { status: "expired", reasonCode: "REVIEW_EXPIRED" };
      default:
        return { status: "pending", reasonCode: "UNDER_REVIEW" };
    }
  }

  auditLog(): readonly ReviewEvent[] {
    return [...this.events];
  }

  // ---- Internals -----------------------------------------------------------

  private requireOpen(id: string): ReviewItem {
    const item = this.items.get(id);
    if (item === undefined) throw new Error(`Review "${id}" does not exist.`);
    if (
      item.status === "approved" ||
      item.status === "refused" ||
      item.status === "expired"
    ) {
      throw new Error(`Review "${id}" is already ${item.status}.`);
    }
    if (this.now().getTime() >= Date.parse(item.dueAt))
      throw new Error(`Review "${id}" has passed its window.`);
    return item;
  }

  /** A reviewer must hold an active grant for the capability, cover the amount, and not be the requester. */
  private requireEligible(item: ReviewItem, reviewerId: string): void {
    if (reviewerId === item.requester)
      throw new Error("The requester cannot review their own request.");
    const grant = this.grants.get(`${item.capability}/${reviewerId}`);
    if (grant === undefined || grant.revoked)
      throw new Error(
        `${reviewerId} holds no active grant for ${item.capability}.`,
      );
    if (
      item.amount !== undefined &&
      grant.maxAmount !== undefined &&
      item.amount > grant.maxAmount
    ) {
      throw new Error(
        `${reviewerId}'s grant does not cover an amount of ${item.amount}.`,
      );
    }
  }

  private finish(
    item: ReviewItem,
    outcome: "APPROVED" | "REFUSED" | "EXPIRED",
    decisions: readonly ReviewerDecision[],
    assignedTo: readonly string[],
    at: string,
  ): ReviewResult {
    const status: ReviewStatus =
      outcome === "APPROVED"
        ? "approved"
        : outcome === "REFUSED"
          ? "refused"
          : "expired";
    this.items.set(item.id, { ...item, status, decisions, assignedTo });
    const result: ReviewResult = {
      reviewId: item.id,
      outcome,
      decidedBy: decisions.map((d) => d.reviewerId),
      digest: item.digest,
      at,
    };
    this.results.set(item.id, result);
    this.record("system", "review.closed", `${item.id}: ${outcome}`);
    return result;
  }

  private record(by: string, event: string, detail: string): void {
    this.events.push({ at: this.now().toISOString(), by, event, detail });
  }
}
