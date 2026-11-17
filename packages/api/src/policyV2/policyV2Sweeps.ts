import { policyV2 } from "@parmana/policy";

/**
 * The sweeps for policy version 2. A sweep expires review items whose window has passed, closes
 * their alerts, records reminders for items past half their window, and escalates open alerts that
 * have passed a stage point. The review and alert state are written together, at the version read.
 * A sweep that changes nothing writes nothing.
 */

/** The part of the state store the sweep uses. The Postgres store satisfies it. */
export interface PolicyV2SweepStateStore {
  load<T>(
    component: "review" | "alerts",
  ): Promise<{ readonly body: T; readonly version: number } | undefined>;
  commitSnapshots(commit: policyV2.persistence.SnapshotCommit): Promise<void>;
}

export interface PolicyV2SweepResult {
  readonly reminders: number;
  readonly expired: number;
  readonly escalated: number;
  /** False if the sweep changed nothing and wrote nothing. */
  readonly written: boolean;
}

export interface PolicyV2SweepServiceOptions {
  readonly store: PolicyV2SweepStateStore;
  readonly now?: () => Date;
}

export class PolicyV2SweepService {
  private readonly clock: () => Date;

  constructor(private readonly options: PolicyV2SweepServiceOptions) {
    this.clock = options.now ?? (() => new Date());
  }

  async run(): Promise<PolicyV2SweepResult> {
    const store = this.options.store;
    const reviewState =
      await store.load<policyV2.review.ReviewSnapshot>("review");
    const alertState =
      await store.load<policyV2.alerts.AlertSnapshot>("alerts");
    if (reviewState === undefined && alertState === undefined) {
      return { reminders: 0, expired: 0, escalated: 0, written: false };
    }

    const queue = new policyV2.review.ReviewQueue(this.clock);
    if (reviewState !== undefined) queue.load(reviewState.body);
    const board = new policyV2.alerts.AlertBoard(
      this.clock,
      () => true,
      () => true,
    );
    if (alertState !== undefined) board.load(alertState.body);

    const review = queue.sweep();
    let closed = 0;
    for (const result of review.expired) {
      const alert = board.findByRef(`review-${result.reviewId}`);
      if (alert !== undefined && alert.status === "open") {
        board.closeByProcess(
          alert.id,
          "The review expired before a decision was made.",
          "system",
        );
        closed += 1;
      }
    }
    const escalated = board.sweep().length;

    const reminders = review.reminders.length;
    const expired = review.expired.length;
    const changed = reminders + expired + closed + escalated > 0;
    if (!changed) return { reminders, expired, escalated, written: false };

    await store.commitSnapshots({
      review: {
        body: queue.snapshot(),
        readVersion: reviewState?.version ?? 0,
      },
      alerts: { body: board.snapshot(), readVersion: alertState?.version ?? 0 },
    });
    return { reminders, expired, escalated, written: true };
  }
}
