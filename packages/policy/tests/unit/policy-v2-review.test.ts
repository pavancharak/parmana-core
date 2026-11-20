import { describe, expect, it } from "vitest";

import {
  ReviewQueue,
  addBusinessDays,
  verifyReviewResult,
  type OpenInput,
} from "../../src/v2/review.js";
import type { ApprovalView } from "../../src/v2/approvals.js";

/** Tests for review (design 4.6, 5.5 and 5.6; plan step 6). */

// Monday 2026-11-16 09:00 UTC.
const START = new Date("2026-11-16T09:00:00.000Z");

function view(): ApprovalView {
  return {
    capability: "erp:pay-invoice",
    target: "INV-1001",
    values: {
      invoiceAmount: {
        value: 9000,
        provenance: "sourced",
        source: "procurement-system",
        claim: "invoice.amount",
      },
      riskScore: { value: 90, provenance: "untrusted" },
    },
    missing: [],
    callerReason: "Invoice due this week.",
  };
}

function input(overrides: Partial<OpenInput> = {}): OpenInput {
  return {
    capability: "erp:pay-invoice",
    target: "INV-1001",
    requester: "agent-7",
    decisionRef: {
      policyHash: "a".repeat(64),
      matchedRuleId: "review-high-risk-score",
    },
    reason: "The risk score is high.",
    view: view(),
    highValue: false,
    amount: 9000,
    windowBusinessDays: 1,
    ...overrides,
  };
}

function queueAt(clock: { now: Date }) {
  const queue = new ReviewQueue(() => clock.now);
  queue.grant("parmana-1", {
    reviewerId: "rev-1",
    capability: "erp:pay-invoice",
    maxAmount: 50_000,
  });
  queue.grant("parmana-1", {
    reviewerId: "rev-2",
    capability: "erp:pay-invoice",
    maxAmount: 50_000,
  });
  queue.grant("parmana-1", {
    reviewerId: "rev-3",
    capability: "erp:pay-invoice",
    maxAmount: 1_000,
  });
  return queue;
}

describe("the review window", () => {
  it("adds business days, skipping the weekend", () => {
    // Friday 2026-11-20 plus one business day is Monday 2026-11-23.
    expect(
      addBusinessDays(new Date("2026-11-20T09:00:00.000Z"), 1).toISOString(),
    ).toBe("2026-11-23T09:00:00.000Z");
    expect(addBusinessDays(START, 3).toISOString()).toBe(
      "2026-11-19T09:00:00.000Z",
    );
  });

  it("refuses a window above three business days, or none", () => {
    const queue = queueAt({ now: START });
    expect(() => queue.open(input({ windowBusinessDays: 4 }))).toThrow(
      /between 1 and 3/,
    );
    expect(() => queue.open(input({ windowBusinessDays: 0 }))).toThrow(
      /between 1 and 3/,
    );
  });
});

describe("opening and deciding", () => {
  it("opens an item that refers to the decision and carries the exact view", () => {
    const clock = { now: START };
    const queue = queueAt(clock);
    const item = queue.open(input());
    expect(item.status).toBe("open");
    expect(item.decisionRef.matchedRuleId).toBe("review-high-risk-score");
    expect(item.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(item.requiredApprovals).toBe(1);
  });

  it("approves an item with one eligible reviewer for a standard item", () => {
    const clock = { now: START };
    const queue = queueAt(clock);
    const item = queue.open(input());
    const result = queue.decide(item.id, "rev-1", "approve");
    expect(result).toMatchObject({ outcome: "APPROVED", decidedBy: ["rev-1"] });
    expect(queue.callerView(item.id)).toEqual({
      status: "approved",
      reasonCode: "REVIEW_APPROVED",
    });
  });

  it("refuses an item when one reviewer rejects it", () => {
    const clock = { now: START };
    const queue = queueAt(clock);
    const item = queue.open(input());
    expect(queue.decide(item.id, "rev-1", "reject")).toMatchObject({
      outcome: "REFUSED",
    });
    expect(queue.callerView(item.id)).toEqual({
      status: "refused",
      reasonCode: "REVIEW_REFUSED",
    });
  });

  it("needs two different reviewers for a high-value item", () => {
    const clock = { now: START };
    const queue = queueAt(clock);
    const item = queue.open(input({ highValue: true }));
    expect(queue.decide(item.id, "rev-1", "approve")).toMatchObject({
      status: "assigned",
    });
    expect(queue.decide(item.id, "rev-2", "approve")).toMatchObject({
      outcome: "APPROVED",
      decidedBy: ["rev-1", "rev-2"],
    });
  });

  it("does not let the same reviewer decide twice", () => {
    const clock = { now: START };
    const queue = queueAt(clock);
    const item = queue.open(input({ highValue: true }));
    queue.decide(item.id, "rev-1", "approve");
    expect(() => queue.decide(item.id, "rev-1", "approve")).toThrow(
      /already decided/,
    );
  });

  it("refuses the requester as a reviewer", () => {
    const clock = { now: START };
    const queue = queueAt(clock);
    queue.grant("parmana-1", {
      reviewerId: "agent-7",
      capability: "erp:pay-invoice",
    });
    const item = queue.open(input());
    expect(() => queue.decide(item.id, "agent-7", "approve")).toThrow(
      /cannot review their own/,
    );
  });

  it("refuses a reviewer whose grant does not cover the amount, or who holds no grant", () => {
    const clock = { now: START };
    const queue = queueAt(clock);
    const item = queue.open(input({ amount: 9000 }));
    expect(() => queue.decide(item.id, "rev-3", "approve")).toThrow(
      /does not cover/,
    );
    expect(() => queue.decide(item.id, "nobody", "approve")).toThrow(
      /no active grant/,
    );
  });

  it("refuses a reviewer whose grant has been revoked", () => {
    const clock = { now: START };
    const queue = queueAt(clock);
    queue.revokeGrant("parmana-1", "rev-1", "erp:pay-invoice");
    const item = queue.open(input());
    expect(() => queue.decide(item.id, "rev-1", "approve")).toThrow(
      /no active grant/,
    );
  });

  it("has no way to change the amount: any verb other than approve or reject is refused", () => {
    const clock = { now: START };
    const queue = queueAt(clock);
    const item = queue.open(input());
    expect(() => queue.decide(item.id, "rev-1", "change" as never)).toThrow(
      /cannot be changed/,
    );
    expect(queue.get(item.id)?.status).toBe("open");
  });
});

describe("the window: reminders and expiry", () => {
  it("sends one reminder at half the window, and expires an undecided item at the end", () => {
    const clock = { now: START };
    const queue = queueAt(clock);
    const item = queue.open(input({ windowBusinessDays: 2 }));

    clock.now = new Date(START.getTime() + 24 * 60 * 60 * 1000);
    expect(queue.sweep()).toEqual({ reminders: [item.id], expired: [] });
    expect(queue.sweep().reminders).toEqual([]);

    clock.now = addBusinessDays(START, 2);
    const swept = queue.sweep();
    expect(swept.expired).toMatchObject([
      { reviewId: item.id, outcome: "EXPIRED" },
    ]);
    expect(queue.callerView(item.id)).toEqual({
      status: "expired",
      reasonCode: "REVIEW_EXPIRED",
    });
  });

  it("refuses a decision after the window has passed, and never approves by default", () => {
    const clock = { now: START };
    const queue = queueAt(clock);
    const item = queue.open(input({ windowBusinessDays: 1 }));
    clock.now = addBusinessDays(START, 1);
    expect(() => queue.decide(item.id, "rev-1", "approve")).toThrow(
      /passed its window/,
    );
    queue.sweep();
    expect(queue.get(item.id)?.status).toBe("expired");
    expect(queue.result(item.id)?.outcome).toBe("EXPIRED");
  });
});

describe("handover and the caller's view", () => {
  it("hands an assigned item to a backup with a grant, and refuses a backup without one", () => {
    const clock = { now: START };
    const queue = queueAt(clock);
    const item = queue.open(input({ highValue: true }));
    queue.decide(item.id, "rev-1", "approve");
    expect(queue.get(item.id)?.assignedTo).toEqual(["rev-1"]);
    expect(() => queue.handover(item.id, "rev-1", "nobody")).toThrow(
      /no active grant/,
    );
    expect(queue.handover(item.id, "rev-1", "rev-2").assignedTo).toEqual([
      "rev-2",
    ]);
    expect(() => queue.handover(item.id, "rev-1", "rev-2")).toThrow(
      /not assigned/,
    );
  });

  it("the caller sees only a status and a reason code, never the reviewers", () => {
    const clock = { now: START };
    const queue = queueAt(clock);
    const item = queue.open(input());
    expect(queue.callerView(item.id)).toEqual({
      status: "pending",
      reasonCode: "UNDER_REVIEW",
    });
    expect(JSON.stringify(queue.callerView(item.id))).not.toContain("rev-");
  });
});

describe("the audit log", () => {
  it("records opening, grants, decisions and closing, in order", () => {
    const clock = { now: START };
    const queue = queueAt(clock);
    const item = queue.open(input());
    queue.decide(item.id, "rev-1", "approve");
    const events = queue.auditLog().map((e) => e.event);
    expect(events).toEqual([
      "grant.added",
      "grant.added",
      "grant.added",
      "review.opened",
      "review.decided",
      "review.closed",
    ]);
  });
});

describe("loading a stored snapshot", () => {
  it("names the missing part instead of failing later", () => {
    const queue = new ReviewQueue(() => START);
    expect(() =>
      queue.load({ items: [] } as unknown as Parameters<
        ReviewQueue["load"]
      >[0]),
    ).toThrow(/'results' must be a list/);
  });

  it("loads a complete snapshot back", () => {
    const queue = new ReviewQueue(() => START);
    const empty = {
      items: [],
      results: [],
      grants: [],
      events: [],
      alerted: [],
      counter: 0,
    };
    expect(() => queue.load(empty)).not.toThrow();
    expect(queue.snapshot()).toEqual(empty);
  });
});

describe("the outcome refers to its decision", () => {
  const DECISION = { recordId: "ev-7", hash: "a".repeat(64) };

  it("carries the decision's record and a hash that verifies", () => {
    const queue = new ReviewQueue(() => START);
    queue.replaceGrants([
      { reviewerId: "reviewer-a", capability: "erp:pay-invoice" },
    ]);
    const item = queue.open({
      capability: "erp:pay-invoice",
      target: "INV-1001",
      requester: "demo",
      decisionRecord: DECISION,
      decisionRef: {
        policyHash: "b".repeat(64),
        matchedRuleId: "review-high-risk",
      },
      reason: "High risk.",
      view: view(),
      highValue: false,
      windowBusinessDays: 1,
    });
    const result = queue.decide(item.id, "reviewer-a", "approve");
    expect(result.decisionRecord).toEqual(DECISION);
    expect(verifyReviewResult(result)).toBe(true);
  });

  it("fails verification when the decision it refers to is changed", () => {
    const queue = new ReviewQueue(() => START);
    queue.replaceGrants([
      { reviewerId: "reviewer-a", capability: "erp:pay-invoice" },
    ]);
    const item = queue.open({
      capability: "erp:pay-invoice",
      target: "INV-1001",
      requester: "demo",
      decisionRecord: DECISION,
      decisionRef: {
        policyHash: "b".repeat(64),
        matchedRuleId: "review-high-risk",
      },
      reason: "High risk.",
      view: view(),
      highValue: false,
      windowBusinessDays: 1,
    });
    const result = queue.decide(item.id, "reviewer-a", "approve");
    const moved = {
      ...result,
      decisionRecord: { recordId: "ev-8", hash: DECISION.hash },
    };
    expect(verifyReviewResult(moved)).toBe(false);
  });
});
