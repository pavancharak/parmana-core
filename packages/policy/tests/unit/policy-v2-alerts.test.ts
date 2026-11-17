import { describe, expect, it } from "vitest";

import {
  AlertBoard,
  AlertError,
  type AlertInput,
  type Notifier,
} from "../../src/v2/alerts.js";

/** Tests for governance alerts (design 11; plan step 7). */

const START = new Date("2026-11-18T09:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function input(overrides: Partial<AlertInput> = {}): AlertInput {
  return {
    ref: "review-3",
    kind: "review.waiting",
    class: "immediate",
    assignee: "rev-1",
    backup: "rev-2",
    blocksAction: "erp:pay-invoice",
    openedAt: START.toISOString(),
    deadline: new Date(START.getTime() + 4 * HOUR).toISOString(),
    explanation: "A payment of 9000 USD is waiting for your decision.",
    consequence: "If nothing is done, the request expires and is refused.",
    steps: ["Read the request.", "Decide approve or reject."],
    helpRef: "reviewers-decide",
    ...overrides,
  };
}

function board(
  clock: { now: Date },
  notify: Notifier = () => true,
  healthy: () => boolean = () => true,
) {
  return new AlertBoard(() => clock.now, notify, healthy);
}

describe("raising and clearing", () => {
  it("is raised at once, and shown to the assignee", () => {
    const clock = { now: START };
    const alerts = board(clock);
    const alert = alerts.raise(input());
    expect(
      alerts.visibleFor({ id: "rev-1", roles: [] }).map((a) => a.id),
    ).toEqual([alert.id]);
  });

  it("cannot be dismissed: it stays open after the assignee navigates away, and reappears at the next login", () => {
    const clock = { now: START };
    const alerts = board(clock);
    const alert = alerts.raise(input());
    // There is no dismiss operation. The alert is still visible to the assignee later on.
    expect(
      alerts.visibleFor({ id: "rev-1", roles: [] }).map((a) => a.id),
    ).toEqual([alert.id]);
    expect(alerts.get(alert.id)?.status).toBe("open");
  });

  it("clears only when every step is done", () => {
    const clock = { now: START };
    const alerts = board(clock);
    const alert = alerts.raise(input());
    expect(alerts.completeStep(alert.id, "rev-1")).toMatchObject({
      status: "open",
      stepIndex: 1,
    });
    expect(alerts.completeStep(alert.id, "rev-1")).toMatchObject({
      status: "complete",
    });
    expect(alerts.visibleFor({ id: "rev-1", roles: [] })).toEqual([]);
  });

  it("clears by process only with a reason, which is logged", () => {
    const clock = { now: START };
    const alerts = board(clock);
    const alert = alerts.raise(input());
    expect(() => alerts.closeByProcess(alert.id, " ", "system")).toThrow(
      AlertError,
    );
    expect(
      alerts.closeByProcess(alert.id, "Review expired.", "system"),
    ).toMatchObject({ status: "closed", closeReason: "Review expired." });
    expect(
      alerts
        .auditLog()
        .some(
          (e) =>
            e.event === "alert.closed" && e.detail.includes("Review expired."),
        ),
    ).toBe(true);
  });

  it("refuses an alert with no steps, no explanation, or no help entry", () => {
    const clock = { now: START };
    const alerts = board(clock);
    expect(() => alerts.raise(input({ steps: [] }))).toThrow(
      /at least one step/,
    );
    expect(() => alerts.raise(input({ explanation: " " }))).toThrow(
      /explanation/,
    );
    expect(() => alerts.raise(input({ helpRef: "" }))).toThrow(/help entry/);
  });
});

describe("escalation", () => {
  it("escalates to the backup at half the window, then the Parmana owner, then Operations at the deadline", () => {
    const clock = { now: START };
    const delivered: string[] = [];
    const alerts = board(clock, (to) => {
      delivered.push(to);
      return true;
    });
    const alert = alerts.raise(input());

    clock.now = new Date(START.getTime() + 2 * HOUR);
    alerts.sweep();
    expect(alerts.get(alert.id)?.stage).toBe(1);
    expect(
      alerts.visibleFor({ id: "rev-2", roles: [] }).map((a) => a.id),
    ).toEqual([alert.id]);

    clock.now = new Date(START.getTime() + 3 * HOUR);
    alerts.sweep();
    expect(alerts.get(alert.id)?.stage).toBe(2);
    expect(
      alerts
        .visibleFor({ id: "owner", roles: ["parmana-owner"] })
        .map((a) => a.id),
    ).toEqual([alert.id]);

    clock.now = new Date(START.getTime() + 4 * HOUR);
    alerts.sweep();
    expect(alerts.get(alert.id)?.stage).toBe(3);
    expect(
      alerts.visibleFor({ id: "ops", roles: ["operator"] }).map((a) => a.id),
    ).toEqual([alert.id]);
    expect(delivered).toEqual([
      "rev-1",
      "rev-2",
      "parmana-owner",
      "operations",
    ]);
  });

  it("escalates each stage once", () => {
    const clock = { now: START };
    const alerts = board(clock);
    alerts.raise(input());
    clock.now = new Date(START.getTime() + 2 * HOUR);
    expect(alerts.sweep()).toHaveLength(1);
    expect(alerts.sweep()).toHaveLength(0);
  });
});

describe("due alerts", () => {
  it("are not shown until the set number of days before the deadline", () => {
    const clock = { now: START };
    const alerts = board(clock);
    const deadline = new Date(START.getTime() + 10 * 24 * HOUR);
    alerts.raise(
      input({
        class: "due",
        deadline: deadline.toISOString(),
        showDaysBefore: 7,
        blocksAction: undefined,
      }),
    );
    expect(alerts.visibleFor({ id: "rev-1", roles: [] })).toEqual([]);
    clock.now = new Date(deadline.getTime() - 7 * 24 * HOUR);
    expect(alerts.visibleFor({ id: "rev-1", roles: [] })).toHaveLength(1);
  });
});

describe("blocking", () => {
  it("stops the action from approving while a blocking alert is open", () => {
    const clock = { now: START };
    const alerts = board(clock);
    expect(alerts.mayApprove("erp:pay-invoice").allowed).toBe(true);
    const alert = alerts.raise(input());
    expect(alerts.mayApprove("erp:pay-invoice")).toMatchObject({
      allowed: false,
    });
    alerts.completeStep(alert.id, "rev-1");
    alerts.completeStep(alert.id, "rev-1");
    expect(alerts.mayApprove("erp:pay-invoice").allowed).toBe(true);
  });

  it("does not block other actions", () => {
    const clock = { now: START };
    const alerts = board(clock);
    alerts.raise(input());
    expect(alerts.mayApprove("erp:other").allowed).toBe(true);
  });

  it("waits if the alert store cannot be read, and records it", () => {
    const clock = { now: START };
    const alerts = board(
      clock,
      () => true,
      () => false,
    );
    const result = alerts.mayApprove("erp:pay-invoice");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/store is unavailable/);
    expect(
      alerts.auditLog().some((e) => e.event === "alert.store-unavailable"),
    ).toBe(true);
  });
});

describe("delivery", () => {
  it("raises an Operations alert when a notification cannot be delivered, and records the failure", () => {
    const clock = { now: START };
    const alerts = board(clock, () => false);
    alerts.raise(input());
    expect(
      alerts.auditLog().some((e) => e.event === "alert.delivery-failed"),
    ).toBe(true);
    const operations = alerts.visibleFor({
      id: "operations",
      roles: ["operator"],
    });
    expect(operations.map((a) => a.kind)).toEqual(["delivery-failure"]);
    expect(operations[0]?.explanation).toMatch(/could not be delivered/);
  });
});
