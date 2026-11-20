/**
 * Runtime decisions under policy version 2, first slice.
 *
 * A decision is run and recorded: the outcome, the signed inputs and the snapshot of keys and
 * thresholds go into the hash-chained evidence log. A decision that needs review opens a review
 * item and an alert. Nothing is released. The caller receives the outcome and a record id, and
 * the response states released: false. No executor is called from here.
 *
 * Not yet built, and so refused or left out:
 *   - source integrations, so sourced values refuse with SOURCE_UNAVAILABLE;
 *   - approver key registration, so approvals refuse;
 */

import { policyV2 } from "@parmana/policy";

import {
  dispatchNotifications,
  NotificationOutbox,
  recordDeliveryFailures,
  type NotificationChannels,
} from "./policyV2Notifications.js";

export type PolicyV2Component = policyV2.persistence.Component;

/** The part of the store the service uses. The Postgres store satisfies it; tests use an in-memory one. */
export interface PolicyV2StateStore {
  load<T>(
    component: PolicyV2Component,
  ): Promise<{ readonly body: T; readonly version: number } | undefined>;
  save(
    component: PolicyV2Component,
    body: unknown,
    readVersion: number,
  ): Promise<number>;
  commitDecision(commit: policyV2.persistence.DecisionCommit): Promise<void>;
  commitSnapshots(commit: policyV2.persistence.SnapshotCommit): Promise<void>;
  readEvidence(): Promise<policyV2.evidence.EvidenceRecord[]>;
}

export class PolicyV2NotEnabledError extends Error {
  constructor(capability: string) {
    super(`Policy version 2 is not enabled for "${capability}".`);
    this.name = "PolicyV2NotEnabledError";
  }
}

export interface PolicyV2DecisionServiceOptions {
  readonly store: PolicyV2StateStore;
  /** Capabilities that accept decisions. Any other capability is refused before anything is read. */
  readonly enabledCapabilities: ReadonlySet<string>;
  /** Approved policy versions by capability. */
  readonly sources: policyV2.decision.SourceClient;
  /** Records used nonces. Durable in production; in memory when none is given. */
  readonly nonces?: policyV2.sourceAnswer.NonceStore;
  /** The channels that send alerts. A channel that is not configured is skipped. */
  readonly channels?: NotificationChannels;
  readonly isSuppressed?: (address: string) => Promise<boolean>;
  readonly now?: () => Date;
}

export interface PolicyV2DecisionResponse {
  readonly outcome: policyV2.decision.Outcome;
  readonly reason: string;
  readonly tier?: string;
  readonly refusal?: policyV2.decision.Refusal;
  readonly recordId: string;
  /** Always false in this slice. Nothing is released from here. */
  readonly released: false;
  /** Set when the decision is waiting for review. The caller can read its status by this id. */
  readonly reviewId?: string;
}

/** Reviews are assigned to the reviewers' queue, not to one person, until assignment is built. */
const REVIEW_ASSIGNEE = "reviewers";

export class PolicyV2DecisionService {
  private readonly clock: () => Date;
  private readonly nonces: policyV2.sourceAnswer.NonceStore;

  constructor(private readonly options: PolicyV2DecisionServiceOptions) {
    this.clock = options.now ?? (() => new Date());
    this.nonces =
      options.nonces ?? new policyV2.sourceAnswer.MemoryNonceStore(this.clock);
  }

  async decide(
    request: policyV2.decision.DecisionRequest,
    caller: string,
  ): Promise<PolicyV2DecisionResponse> {
    if (!this.options.enabledCapabilities.has(request.capability)) {
      throw new PolicyV2NotEnabledError(request.capability);
    }
    const now = this.clock();
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
    queue.replaceGrants(
      register.activeReviewGrants().map((grant) => ({
        reviewerId: grant.reviewerId,
        capability: grant.capability,
        ...(grant.maxAmount !== undefined
          ? { maxAmount: grant.maxAmount }
          : {}),
      })),
    );
    const outbox = new NotificationOutbox();
    const board = new policyV2.alerts.AlertBoard(
      this.clock,
      outbox.notify,
      () => true,
    );
    if (alertState !== undefined) board.load(alertState.body);

    const log = new policyV2.evidence.EvidenceLog();
    log.load(await store.readEvidence());

    const approvers = approverKeysFrom(register);
    const decision = await policyV2.decision.decide(request, {
      policies: approvedPolicyFrom(register),
      approvedButNotLive: (capability: string) =>
        register.approvedButNotLive(capability),
      register,
      sources: this.options.sources,
      nonces: this.nonces,
      approvals: policyV2.approvals.approvalChecker({
        approvers,
        nonces: this.nonces,
      }),
      now: this.clock,
    });

    const policy = approvedPolicyFrom(register)(request.capability)?.policy as
      { thresholds?: Record<string, unknown> } | undefined;
    const snapshot = policyV2.evidence.snapshotFor(
      policy,
      request.capability,
      decision.inputs,
      register,
      approvers,
    );
    // The evidence append is the commit point: it refuses unless it links to the last stored record.
    const record = policyV2.evidence.recordDecision(
      log,
      request,
      decision,
      snapshot,
      now,
    );

    let reviewId: string | undefined;
    let reviewed = false;
    if (decision.outcome === "REVIEW") {
      // highValue is set true until the risk function is wired. That only requires more reviewers, so it fails safe.
      const item = queue.open({
        capability: request.capability,
        decisionRecord: { recordId: record.recordId, hash: record.hash },
        target: request.target,
        requester: caller,
        decisionRef: {
          policyHash: decision.policy.hash,
          matchedRuleId: decision.matchedRuleId ?? "",
        },
        reason: decision.reason,
        view: {
          capability: request.capability,
          target: request.target,
          values: decision.values,
        } as unknown as policyV2.approvals.ApprovalView,
        highValue: true,
        windowBusinessDays: policyV2.review.MAX_REVIEW_WINDOW_BUSINESS_DAYS,
      });
      board.raise({
        ref: `review-${item.id}`,
        kind: "review",
        class: "immediate",
        assignee: REVIEW_ASSIGNEE,
        openedAt: now.toISOString(),
        deadline: policyV2.review
          .addBusinessDays(now, policyV2.review.MAX_REVIEW_WINDOW_BUSINESS_DAYS)
          .toISOString(),
        explanation: `A decision on ${request.capability} for ${request.target} is waiting for review.`,
        consequence:
          "The decision is not released until it is reviewed. If the window passes, it expires.",
        steps: ["Review the decision, then approve or reject it."],
        helpRef: "reviewers",
      });
      reviewId = item.id;
      reviewed = true;
    }

    await store.commitDecision({
      record,
      ...(reviewed
        ? {
            review: {
              body: queue.snapshot(),
              readVersion: reviewState?.version ?? 0,
            },
            alerts: {
              body: board.snapshot(),
              readVersion: alertState?.version ?? 0,
            },
          }
        : {}),
    });

    const delivery = await dispatchNotifications(outbox.take(), {
      register,
      channels: this.options.channels ?? {},
      ...(this.options.isSuppressed !== undefined
        ? { isSuppressed: this.options.isSuppressed }
        : {}),
    });
    await recordDeliveryFailures(store, delivery.failures, now);

    return {
      outcome: decision.outcome,
      reason: decision.reason,
      ...(decision.tier !== undefined ? { tier: decision.tier } : {}),
      ...(decision.refusal !== undefined ? { refusal: decision.refusal } : {}),
      recordId: record.recordId,
      released: false,
      ...(reviewId !== undefined ? { reviewId } : {}),
    };
  }
}

/** The approver keys the register holds, as the approval checker reads them. Only active keys count; revoked keys stay so they can be refused by name. */
export function approverKeysFrom(
  register: policyV2.register.PolicyRegister,
): policyV2.approvals.ApproverKeys {
  const keys = new policyV2.approvals.ApproverKeys();
  for (const key of register.listApproverKeys()) {
    if (key.status === "pending") continue;
    keys.register(key.approverId, key.keyId, key.publicKeyPem);
    if (key.status === "revoked") keys.revoke(key.approverId, key.keyId);
  }
  return keys;
}

/**
 * The policy a decision may use for each capability: the approved version, once the action has
 * passed the go-live gate. Read from the register at each decision, so an approval counts at once.
 */
export function approvedPolicyFrom(
  register: policyV2.register.PolicyRegister,
): (capability: string) => policyV2.decision.ApprovedPolicy | undefined {
  return (capability) => {
    const active = register.activePolicy(capability);
    return active === undefined ? undefined : { policy: active.policy };
  };
}
