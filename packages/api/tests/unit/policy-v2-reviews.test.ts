import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { policyV2 } from "@parmana/policy";

import {
  PolicyV2ReviewRefused,
  PolicyV2ReviewService,
  type PolicyV2ReviewStateStore,
} from "../../src/policyV2/policyV2Reviews.js";
import { createPolicyV2ReviewsRouter } from "../../src/routes/policy-v2-reviews.js";

const NOW = new Date("2026-11-18T09:00:00Z");
const CAP = "erp:pay-invoice";
const OWNER: policyV2.register.Person = {
  id: "owner-1",
  roles: ["parmana-owner"],
};
const ACTION_OWNER: policyV2.register.Person = { id: "action-1", roles: [] };

/** An in-memory store with the same version rule as the database. */
function memoryStore() {
  const state = new Map<string, { body: unknown; version: number }>();
  const store: PolicyV2ReviewStateStore & { state: typeof state } = {
    state,
    async load<T>(component: string) {
      return state.get(component) as { body: T; version: number } | undefined;
    },
    async save(
      component: "review" | "alerts",
      body: unknown,
      readVersion: number,
    ) {
      const current = state.get(component)?.version ?? 0;
      if (current !== readVersion) {
        throw new policyV2.persistence.PersistenceConflictError(
          `${component} changed.`,
        );
      }
      state.set(component, { body, version: current + 1 });
      return current + 1;
    },
  };
  return store;
}

/** A register with a reviewer granted, a second reviewer with no grant, and one open review item. */
async function setup() {
  const register = new policyV2.register.PolicyRegister(() => NOW);
  register.bootstrapOwner(OWNER.id);
  register.grantRole(OWNER, ACTION_OWNER.id, "action-owner");
  register.grantRole(OWNER, "rev-1", "reviewer");
  register.grantRole(OWNER, "rev-2", "reviewer");
  register.registerAction(
    {
      capability: CAP,
      owner: ACTION_OWNER.id,
      successor: "action-2",
      reviewers: ["rev-1", "rev-2", "rev-3"],
      review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
    },
    OWNER,
  );
  register.grantReview(CAP, "rev-1", ACTION_OWNER);

  const queue = new policyV2.review.ReviewQueue(() => NOW);
  queue.replaceGrants(
    register
      .activeReviewGrants()
      .map((g) => ({ reviewerId: g.reviewerId, capability: g.capability })),
  );
  const item = queue.open({
    decisionRecord: { recordId: "ev-1", hash: "0".repeat(64) },
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
  store.state.set("register", { body: register.snapshot(), version: 1 });
  await store.save("review", queue.snapshot(), 0);
  await store.save("alerts", board.snapshot(), 0);
  return {
    store,
    item,
    service: new PolicyV2ReviewService({ store, now: () => NOW }),
  };
}

describe("a reviewer's decision", () => {
  it("approves a review, finishes it, and clears its alert", async () => {
    const { store, item, service } = await setup();
    const response = await service.decide("rev-1", item.id, "approve");
    expect(response.final).toBe(true);
    expect(response.outcome).toBe("APPROVED");
    expect(response.status).toBe("approved");
    const alerts = store.state.get("alerts")!
      .body as policyV2.alerts.AlertSnapshot;
    expect(
      alerts.alerts.find((a) => a.ref === `review-${item.id}`)?.status,
    ).toBe("complete");
  });

  it("rejects a review, and finishes it as refused", async () => {
    const { item, service } = await setup();
    const response = await service.decide("rev-1", item.id, "reject");
    expect(response.outcome).toBe("REFUSED");
  });

  it("refuses a reviewer with no grant, even one who holds the reviewer role", async () => {
    const { item, service } = await setup();
    await expect(
      service.decide("rev-2", item.id, "approve"),
    ).rejects.toBeInstanceOf(PolicyV2ReviewRefused);
  });

  it("refuses a decision from the requester", async () => {
    const { item, service } = await setup();
    await expect(
      service.decide("partner-a", item.id, "approve"),
    ).rejects.toBeInstanceOf(PolicyV2ReviewRefused);
  });

  it("refuses a decision on a review that has already finished", async () => {
    const { item, service } = await setup();
    await service.decide("rev-1", item.id, "approve");
    await expect(
      service.decide("rev-1", item.id, "reject"),
    ).rejects.toBeInstanceOf(PolicyV2ReviewRefused);
  });

  it("refuses a save that read a stale review, and records nothing", async () => {
    const { store, item, service } = await setup();
    const real = store.load.bind(store);
    store.load = async <T>(component: "register" | "review" | "alerts") => {
      const current = (await real(component)) as
        { body: T; version: number } | undefined;
      if (component === "review" && current !== undefined) {
        return { body: current.body, version: current.version - 1 };
      }
      return current;
    };
    await expect(
      service.decide("rev-1", item.id, "approve"),
    ).rejects.toBeInstanceOf(policyV2.persistence.PersistenceConflictError);
    const review = store.state.get("review")!
      .body as policyV2.review.ReviewSnapshot;
    expect(review.items.find((i) => i.id === item.id)?.decisions).toEqual([]);
  });
});

describe("POST /v2/reviews/:id/decision", () => {
  function app(service: PolicyV2ReviewService) {
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => {
      const caller = req.headers["x-caller"];
      if (typeof caller === "string") req.callerId = caller;
      next();
    });
    a.use("/v2/reviews", createPolicyV2ReviewsRouter(service));
    return a;
  }

  it("returns 401 with no caller", async () => {
    const { item, service } = await setup();
    const res = await request(app(service))
      .post(`/v2/reviews/${item.id}/decision`)
      .send({ decision: "approve" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for a decision that is neither approve nor reject", async () => {
    const { item, service } = await setup();
    const res = await request(app(service))
      .post(`/v2/reviews/${item.id}/decision`)
      .set("x-caller", "rev-1")
      .send({ decision: "maybe" });
    expect(res.status).toBe(400);
  });

  it("returns 422 with the reason for a reviewer with no grant", async () => {
    const { item, service } = await setup();
    const res = await request(app(service))
      .post(`/v2/reviews/${item.id}/decision`)
      .set("x-caller", "rev-2")
      .send({ decision: "approve" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("refused");
  });

  it("returns 200 with the outcome when a granted reviewer approves", async () => {
    const { item, service } = await setup();
    const res = await request(app(service))
      .post(`/v2/reviews/${item.id}/decision`)
      .set("x-caller", "rev-1")
      .send({ decision: "approve" });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("APPROVED");
  });
});

describe("the requester's view of a review", () => {
  it("shows the requester the status, and the outcome once the review is finished", async () => {
    const { item, service } = await setup();
    expect(await service.requesterView("partner-a", item.id)).toEqual({
      status: "pending",
      reasonCode: "UNDER_REVIEW",
    });
    await service.decide("rev-1", item.id, "approve");
    expect(await service.requesterView("partner-a", item.id)).toEqual({
      status: "approved",
      reasonCode: "REVIEW_APPROVED",
    });
  });

  it("gives no view to anyone who did not ask, including the reviewer", async () => {
    const { item, service } = await setup();
    expect(await service.requesterView("rev-1", item.id)).toBeUndefined();
    expect(await service.requesterView("partner-b", item.id)).toBeUndefined();
    expect(
      await service.requesterView("partner-a", "review-999"),
    ).toBeUndefined();
  });
});

describe("GET /v2/reviews/:id", () => {
  function app(service: PolicyV2ReviewService) {
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => {
      const caller = req.headers["x-caller"];
      if (typeof caller === "string") req.callerId = caller;
      next();
    });
    a.use("/v2/reviews", createPolicyV2ReviewsRouter(service));
    return a;
  }

  it("returns 401 with no caller, and 404 to anyone but the requester", async () => {
    const { item, service } = await setup();
    expect(
      (await request(app(service)).get(`/v2/reviews/${item.id}`)).status,
    ).toBe(401);
    const other = await request(app(service))
      .get(`/v2/reviews/${item.id}`)
      .set("x-caller", "partner-b");
    expect(other.status).toBe(404);
  });

  it("returns the status to the requester", async () => {
    const { item, service } = await setup();
    const res = await request(app(service))
      .get(`/v2/reviews/${item.id}`)
      .set("x-caller", "partner-a");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
  });
});
