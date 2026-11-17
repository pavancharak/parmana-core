import { policyV2 } from "@parmana/policy";

/**
 * A reviewer's decision on a review item. The reviewer must hold an active grant for the item's
 * action, and must not be the requester. The queue enforces both, and one decision per reviewer.
 * The review and its alert are saved together. The decision releases nothing.
 */

/** The part of the state store the service uses. The Postgres store satisfies it. */
export interface PolicyV2ReviewStateStore {
  load<T>(
    component: "register" | "review" | "alerts",
  ): Promise<{ readonly body: T; readonly version: number } | undefined>;
  save(
    component: "review" | "alerts",
    body: unknown,
    readVersion: number,
  ): Promise<number>;
}

/** The queue refused the decision: no grant, the requester, a second decision, or a closed item. */
export class PolicyV2ReviewRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyV2ReviewRefused";
  }
}

export interface PolicyV2ReviewDecisionResponse {
  readonly itemId: string;
  /** The status of the item after this decision. */
  readonly status: string;
  /** True once the review is finished. The outcome is set then. */
  readonly final: boolean;
  readonly outcome?: "APPROVED" | "REFUSED";
  readonly decisionsRecorded: number;
}

export interface PolicyV2ReviewServiceOptions {
  readonly store: PolicyV2ReviewStateStore;
  readonly now?: () => Date;
}

export class PolicyV2ReviewService {
  private readonly clock: () => Date;

  constructor(private readonly options: PolicyV2ReviewServiceOptions) {
    this.clock = options.now ?? (() => new Date());
  }

  /**
   * The review's status for the requester who asked for it. Anyone else, and any item that does not
   * exist, gets undefined, so the route does not reveal whether an item exists.
   */
  async requesterView(
    callerId: string,
    itemId: string,
  ): Promise<policyV2.review.CallerView | undefined> {
    const reviewState =
      await this.options.store.load<policyV2.review.ReviewSnapshot>("review");
    if (reviewState === undefined) return undefined;
    const queue = new policyV2.review.ReviewQueue(this.clock);
    queue.load(reviewState.body);
    const item = queue.get(itemId);
    if (item === undefined || item.requester !== callerId) return undefined;
    return queue.callerView(itemId);
  }

  async decide(
    reviewerId: string,
    itemId: string,
    decision: "approve" | "reject",
  ): Promise<PolicyV2ReviewDecisionResponse> {
    const store = this.options.store;
    const registerState =
      await store.load<policyV2.register.RegisterSnapshot>("register");
    const reviewState =
      await store.load<policyV2.review.ReviewSnapshot>("review");
    const alertState =
      await store.load<policyV2.alerts.AlertSnapshot>("alerts");

    const register = new policyV2.register.PolicyRegister(this.clock);
    if (registerState !== undefined) register.load(registerState.body);
    const queue = new policyV2.review.ReviewQueue(this.clock);
    if (reviewState !== undefined) queue.load(reviewState.body);
    // The register is the source of truth for grants, so the queue takes its grants from there.
    queue.replaceGrants(
      register.activeReviewGrants().map((grant) => ({
        reviewerId: grant.reviewerId,
        capability: grant.capability,
        ...(grant.maxAmount !== undefined
          ? { maxAmount: grant.maxAmount }
          : {}),
      })),
    );
    const board = new policyV2.alerts.AlertBoard(
      this.clock,
      () => true,
      () => true,
    );
    if (alertState !== undefined) board.load(alertState.body);

    let result: ReturnType<policyV2.review.ReviewQueue["decide"]>;
    try {
      result = queue.decide(itemId, reviewerId, decision);
    } catch (error) {
      throw new PolicyV2ReviewRefused(
        error instanceof Error
          ? error.message
          : "The review refused the decision.",
      );
    }

    const final = "outcome" in result;
    if (final) {
      // The alert for the item clears once its review is finished.
      const alert = board.findByRef(`review-${itemId}`);
      if (alert !== undefined && alert.status === "open")
        board.completeStep(alert.id, reviewerId);
    }
    await store.save("review", queue.snapshot(), reviewState?.version ?? 0);
    if (final)
      await store.save("alerts", board.snapshot(), alertState?.version ?? 0);

    const item = final
      ? queue.get(itemId)
      : (result as policyV2.review.ReviewItem);
    return {
      itemId,
      status: item?.status ?? "closed",
      final,
      ...(final
        ? {
            outcome: (result as policyV2.review.ReviewResult).outcome as
              "APPROVED" | "REFUSED",
          }
        : {}),
      decisionsRecorded: item?.decisions.length ?? 0,
    };
  }
}
