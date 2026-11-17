import { afterEach, describe, expect, it, vi } from "vitest";
import { policyV2 } from "@parmana/policy";

import {
  PolicyV2SweepService,
  type PolicyV2SweepStateStore,
} from "../../src/policyV2/policyV2Sweeps.js";
import {
  policyV2SweepSecondsFrom,
  startPolicyV2SweepTimer,
} from "../../src/policyV2/createPolicyV2Runtime.js";

const NOW = new Date("2026-11-18T09:00:00Z");
const CAP = "erp:pay-invoice";

/** An in-memory store with the same version rule as the database. */
function memoryStore() {
  const state = new Map<string, { body: unknown; version: number }>();
  const store: PolicyV2SweepStateStore & { state: typeof state } = {
    state,
    async load<T>(component: "review" | "alerts") {
      return state.get(component) as { body: T; version: number } | undefined;
    },
    async commitSnapshots(commit) {
      for (const component of ["review", "alerts"] as const) {
        const written = commit[component];
        if (
          written !== undefined &&
          (state.get(component)?.version ?? 0) !== written.readVersion
        ) {
          throw new policyV2.persistence.PersistenceConflictError(
            `${component} changed.`,
          );
        }
      }
      for (const component of ["review", "alerts"] as const) {
        const written = commit[component];
        if (written !== undefined) {
          state.set(component, {
            body: written.body,
            version: written.readVersion + 1,
          });
        }
      }
    },
  };
  return store;
}

/** One open review item, raised at NOW with an alert for it. */
function withOpenReview() {
  const queue = new policyV2.review.ReviewQueue(() => NOW);
  queue.replaceGrants([{ reviewerId: "rev-1", capability: CAP }]);
  const item = queue.open({
    capability: CAP,
    target: "inv-1",
    requester: "partner-a",
    decisionRef: { policyHash: "hash", matchedRuleId: "rule" },
    reason: "Needs a person.",
    view: {
      capability: CAP,
      target: "inv-1",
      values: {},
    } as unknown as policyV2.approvals.ApprovalView,
    highValue: false,
    windowBusinessDays: 1,
  });
  const board = new policyV2.alerts.AlertBoard(
    () => NOW,
    () => true,
    () => true,
  );
  board.raise({
    ref: `review-${item.id}`,
    kind: "review",
    class: "immediate",
    assignee: "reviewers",
    openedAt: NOW.toISOString(),
    deadline: "2026-11-25T09:00:00Z",
    explanation: "A decision is waiting for review.",
    consequence: "It expires if no one reviews it.",
    steps: ["Review the decision, then approve or reject it."],
    helpRef: "reviewers",
  });
  const store = memoryStore();
  store.state.set("review", { body: queue.snapshot(), version: 1 });
  store.state.set("alerts", { body: board.snapshot(), version: 1 });
  return { store, item };
}

describe("the sweep", () => {
  it("expires an overdue review, and closes its alert with the reason", async () => {
    const { store, item } = withOpenReview();
    const result = await new PolicyV2SweepService({
      store,
      now: () => new Date("2026-11-22T09:00:00Z"),
    }).run();
    expect(result.expired).toBe(1);
    expect(result.written).toBe(true);

    const review = store.state.get("review")!
      .body as policyV2.review.ReviewSnapshot;
    expect(review.items.find((i) => i.id === item.id)?.status).toBe("expired");
    const alerts = store.state.get("alerts")!
      .body as policyV2.alerts.AlertSnapshot;
    const alert = alerts.alerts.find((a) => a.ref === `review-${item.id}`);
    expect(alert?.status).toBe("closed");
    expect(alert?.closeReason).toMatch(/expired/);
  });

  it("writes nothing when nothing is due", async () => {
    const { store } = withOpenReview();
    const before = store.state.get("review")!.version;
    const result = await new PolicyV2SweepService({
      store,
      now: () => NOW,
    }).run();
    expect(result.written).toBe(false);
    expect(store.state.get("review")!.version).toBe(before);
  });

  it("escalates an open alert once it has passed half its window", async () => {
    const board = new policyV2.alerts.AlertBoard(
      () => NOW,
      () => true,
      () => true,
    );
    board.raise({
      ref: "review-x",
      kind: "review",
      class: "immediate",
      assignee: "reviewers",
      openedAt: NOW.toISOString(),
      deadline: "2026-11-20T09:00:00Z",
      explanation: "Waiting.",
      consequence: "Escalates.",
      steps: ["Do it."],
      helpRef: "reviewers",
    });
    const store = memoryStore();
    store.state.set("alerts", { body: board.snapshot(), version: 1 });
    const result = await new PolicyV2SweepService({
      store,
      now: () => new Date("2026-11-19T12:00:00Z"),
    }).run();
    expect(result.escalated).toBe(1);
    expect(store.state.get("alerts")!.version).toBe(2);
  });

  it("does nothing when there is no review or alert state yet", async () => {
    const result = await new PolicyV2SweepService({
      store: memoryStore(),
      now: () => NOW,
    }).run();
    expect(result).toEqual({
      reminders: 0,
      expired: 0,
      escalated: 0,
      written: false,
    });
  });
});

describe("the sweep interval and timer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is off when unset, and refuses a value that is not a whole number from 1 to 86400", () => {
    expect(policyV2SweepSecondsFrom({})).toBeUndefined();
    expect(
      policyV2SweepSecondsFrom({ PARMANA_POLICY_V2_SWEEP_SECONDS: "60" }),
    ).toBe(60);
    expect(() =>
      policyV2SweepSecondsFrom({ PARMANA_POLICY_V2_SWEEP_SECONDS: "0" }),
    ).toThrow(/whole number/);
    expect(() =>
      policyV2SweepSecondsFrom({ PARMANA_POLICY_V2_SWEEP_SECONDS: "soon" }),
    ).toThrow(/whole number/);
    expect(() =>
      policyV2SweepSecondsFrom({ PARMANA_POLICY_V2_SWEEP_SECONDS: "86401" }),
    ).toThrow(/whole number/);
  });

  it("runs the sweep on each interval, and stops when the timer is cleared", async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue({
      reminders: 0,
      expired: 0,
      escalated: 0,
      written: false,
    });
    const handle = startPolicyV2SweepTimer(
      { run } as unknown as PolicyV2SweepService,
      60,
      () => {},
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);
    clearInterval(handle);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
