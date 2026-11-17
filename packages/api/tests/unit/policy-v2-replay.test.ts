import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { policyV2 } from "@parmana/policy";

import { PolicyV2DecisionService } from "../../src/policyV2/policyV2Decisions.js";
import { PolicyV2ForbiddenError } from "../../src/policyV2/policyV2Register.js";
import { PolicyV2ReplayService } from "../../src/policyV2/policyV2Replay.js";
import { createPolicyV2ReplayRouter } from "../../src/routes/policy-v2-replay.js";

const NOW = new Date("2026-11-17T10:00:00Z");
const CAP = "erp:pay-invoice";
const OWNER: policyV2.register.Person = {
  id: "owner-1",
  roles: ["parmana-owner"],
};

/** An in-memory store with the same rules as the database: versions, chain links, one commit. */
function memoryStore() {
  const state = new Map<string, { body: unknown; version: number }>();
  const evidence: policyV2.evidence.EvidenceRecord[] = [];
  return {
    state,
    evidence,
    async load<T>(component: string) {
      return state.get(component) as { body: T; version: number } | undefined;
    },
    async save(component: string, body: unknown, readVersion: number) {
      const current = state.get(component)?.version ?? 0;
      if (current !== readVersion) {
        throw new policyV2.persistence.PersistenceConflictError(
          `${component} changed.`,
        );
      }
      state.set(component, { body, version: current + 1 });
      return current + 1;
    },
    async commitDecision(commit: policyV2.persistence.DecisionCommit) {
      if (commit.record.prevHash !== (evidence.at(-1)?.hash ?? "genesis")) {
        throw new policyV2.persistence.PersistenceConflictError(
          "Does not link.",
        );
      }
      evidence.push(commit.record);
    },
    async readEvidence() {
      return [...evidence];
    },
  };
}

const POLICY = {
  policyId: "minimal",
  policyVersion: "2.0.0",
  schemaVersion: "2.0.0",
  capability: CAP,
  description: "A minimal policy for tests.",
  owner: "finance-owner",
  signals: {
    requestedAmount: { type: "number", provenance: "untrusted", unit: "USD" },
  },
  review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
  rules: [
    {
      id: "reject-all",
      tier: "reject",
      when: { always: true },
      outcome: { action: "reject", reason: "Rejected." },
    },
  ],
};

/** A register with an approved, live policy, and one decision recorded under it. */
async function setup() {
  const register = new policyV2.register.PolicyRegister(() => NOW);
  register.bootstrapOwner(OWNER.id);
  register.grantRole(OWNER, "action-1", "action-owner");
  register.grantRole(OWNER, "second-1", "second-approver");
  register.grantRole(OWNER, "gate-1", "gate-owner");
  register.registerAction(
    {
      capability: CAP,
      owner: "action-1",
      successor: "action-2",
      reviewers: ["rev-1", "rev-2", "rev-3"],
      review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
    },
    OWNER,
  );
  register.recordTest(CAP, "reject", { id: "gate-1", roles: ["gate-owner"] });
  register.proposePolicy(POLICY, { id: "action-1", roles: [] });
  register.approvePolicy(CAP, "2.0.0", {
    id: "second-1",
    roles: ["second-approver"],
  });
  register.runGoLive(CAP, { id: "gate-1", roles: ["gate-owner"] });

  const store = memoryStore();
  await store.save("register", register.snapshot(), 0);
  const decisions = new PolicyV2DecisionService({
    store,
    enabledCapabilities: new Set([CAP]),
    sources: async () => {
      throw new Error("no source");
    },
    now: () => NOW,
  });
  const response = await decisions.decide(
    {
      capability: CAP,
      transactionId: "tx-1",
      target: "inv-1",
      parameters: {},
      signals: { requestedAmount: 100 },
    },
    "partner-a",
  );
  return {
    store,
    recordId: response.recordId,
    replay: new PolicyV2ReplayService({ store }),
  };
}

describe("replaying a recorded decision", () => {
  it("reproduces a decision made under an approved policy", async () => {
    const { recordId, replay } = await setup();
    const result = await replay.replayRecord(OWNER.id, recordId);
    expect(result).toEqual({ recordId, reproduced: true, differences: [] });
  });

  it("reports a record whose policy version is no longer in the register", async () => {
    const { store, recordId, replay } = await setup();
    const saved = store.state.get("register")!;
    const body = saved.body as policyV2.register.RegisterSnapshot;
    store.state.set("register", {
      body: { ...body, policyVersions: [] },
      version: saved.version + 1,
    });
    const result = await replay.replayRecord(OWNER.id, recordId);
    expect(result?.reproduced).toBe(false);
    expect(result?.differences.join(" ")).toMatch(/is not in the store/);
  });

  it("returns undefined for a record that does not exist", async () => {
    const { replay } = await setup();
    expect(await replay.replayRecord(OWNER.id, "ev-999")).toBeUndefined();
  });

  it("refuses a caller who holds no register role", async () => {
    const { recordId, replay } = await setup();
    await expect(
      replay.replayRecord("partner-a", recordId),
    ).rejects.toBeInstanceOf(PolicyV2ForbiddenError);
  });
});

describe("GET /v2/evidence/:recordId/replay", () => {
  function app(service: PolicyV2ReplayService) {
    const a = express();
    a.use((req, _res, next) => {
      const caller = req.headers["x-caller"];
      if (typeof caller === "string") req.callerId = caller;
      next();
    });
    a.use("/v2/evidence", createPolicyV2ReplayRouter(service));
    return a;
  }

  it("returns 401 with no caller, 403 without a role, and 404 for an unknown record", async () => {
    const { recordId, replay } = await setup();
    expect(
      (await request(app(replay)).get(`/v2/evidence/${recordId}/replay`))
        .status,
    ).toBe(401);
    const forbidden = await request(app(replay))
      .get(`/v2/evidence/${recordId}/replay`)
      .set("x-caller", "partner-a");
    expect(forbidden.status).toBe(403);
    const missing = await request(app(replay))
      .get("/v2/evidence/ev-999/replay")
      .set("x-caller", OWNER.id);
    expect(missing.status).toBe(404);
  });

  it("returns the replay result to a caller with a role", async () => {
    const { recordId, replay } = await setup();
    const res = await request(app(replay))
      .get(`/v2/evidence/${recordId}/replay`)
      .set("x-caller", OWNER.id);
    expect(res.status).toBe(200);
    expect(res.body.reproduced).toBe(true);
  });
});
