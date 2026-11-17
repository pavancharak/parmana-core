import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { policyV2 } from "@parmana/policy";

import { PolicyV2ConsoleService } from "../../src/policyV2/policyV2Console.js";
import { createPolicyV2ConsoleRouter } from "../../src/routes/policy-v2-console.js";

const NOW = new Date("2026-11-18T09:00:00Z");
const OWNER: policyV2.register.Person = {
  id: "owner-1",
  roles: ["parmana-owner"],
};

/** A store with a register, optionally an alert for the owner, and no evidence or audit. */
function memoryStore(withAlert = false) {
  const state = new Map<string, { body: unknown; version: number }>();
  const register = new policyV2.register.PolicyRegister(() => NOW);
  register.bootstrapOwner(OWNER.id);
  state.set("register", { body: register.snapshot(), version: 1 });
  if (withAlert) {
    const board = new policyV2.alerts.AlertBoard(
      () => NOW,
      () => true,
      () => true,
    );
    board.raise({
      ref: "review-1",
      kind: "review",
      class: "immediate",
      assignee: OWNER.id,
      openedAt: NOW.toISOString(),
      deadline: "2026-11-25T09:00:00Z",
      explanation: "<img src=x onerror=alert(1)> is waiting.",
      consequence: "It expires.",
      steps: ["Review it."],
      helpRef: "reviewers",
    });
    state.set("alerts", { body: board.snapshot(), version: 1 });
  }
  return {
    state,
    async load<T>(component: "register" | "review" | "alerts") {
      return state.get(component) as { body: T; version: number } | undefined;
    },
    async readEvidence() {
      return [];
    },
    async readAuditPage() {
      return [];
    },
  };
}

function appFor(store: ReturnType<typeof memoryStore>) {
  const a = express();
  a.use((req, _res, next) => {
    const caller = req.headers["x-caller"];
    if (typeof caller === "string") req.callerId = caller;
    next();
  });
  a.use(
    "/v2/console",
    createPolicyV2ConsoleRouter(
      new PolicyV2ConsoleService({ store, now: () => NOW }),
    ),
  );
  return a;
}

describe("the console", () => {
  it("serves the register screen as HTML to a caller who may open it", async () => {
    const res = await request(appFor(memoryStore()))
      .get("/v2/console/register")
      .set("x-caller", OWNER.id);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain("Sources");
  });

  it("escapes alert text, so it cannot run as markup", async () => {
    const res = await request(appFor(memoryStore(true)))
      .get("/v2/console/home")
      .set("x-caller", OWNER.id);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("<img src=x");
    expect(res.text).toContain("&lt;img");
  });

  it("returns 401 with no caller, 403 to a caller with no role, and 404 for an unknown screen", async () => {
    const app = appFor(memoryStore());
    expect((await request(app).get("/v2/console/home")).status).toBe(401);
    expect(
      (await request(app).get("/v2/console/home").set("x-caller", "stranger"))
        .status,
    ).toBe(403);
    expect(
      (await request(app).get("/v2/console/secrets").set("x-caller", OWNER.id))
        .status,
    ).toBe(404);
  });

  it("refuses a screen that the caller's role does not allow", async () => {
    const store = memoryStore();
    const register = new policyV2.register.PolicyRegister(() => NOW);
    register.bootstrapOwner(OWNER.id);
    const allowedNot = policyV2.console.SCREEN_ACCESS.gate as readonly string[];
    const role = (
      [
        "second-approver",
        "risk-function",
        "source-owner",
        "reviewer",
        "action-owner",
      ] as const
    ).find((r) => !allowedNot.includes(r))!;
    register.grantRole(OWNER, "viewer-1", role);
    store.state.set("register", { body: register.snapshot(), version: 2 });
    const res = await request(appFor(store))
      .get("/v2/console/gate")
      .set("x-caller", "viewer-1");
    expect(res.status).toBe(403);
  });
});
