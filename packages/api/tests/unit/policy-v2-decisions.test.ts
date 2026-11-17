import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { policyV2 } from "@parmana/policy";

import { createPolicyV2Runtime } from "../../src/policyV2/createPolicyV2Runtime.js";
import {
  PolicyV2DecisionService,
  PolicyV2NotEnabledError,
  type PolicyV2StateStore,
} from "../../src/policyV2/policyV2Decisions.js";
import { createPolicyV2DecisionsRouter } from "../../src/routes/policy-v2-decisions.js";

const NOW = new Date("2026-11-17T10:00:00Z");
const CAPABILITY = "erp:pay-invoice";

/** An in-memory store that enforces the same rules as the Postgres one: versions and chain links. */
function memoryStore() {
  const state = new Map<string, { body: unknown; version: number }>();
  const evidence: policyV2.evidence.EvidenceRecord[] = [];
  const store = {
    evidence,
    loads: 0,
    async load<T>(component: string) {
      store.loads += 1;
      return state.get(component) as { body: T; version: number } | undefined;
    },
    async save(component: string, body: unknown, readVersion: number) {
      const current = state.get(component)?.version ?? 0;
      if (current !== readVersion) {
        throw new policyV2.persistence.PersistenceConflictError(
          `${component} changed since it was read.`,
        );
      }
      state.set(component, { body, version: current + 1 });
      return current + 1;
    },
    async appendEvidence(record: policyV2.evidence.EvidenceRecord) {
      const last = evidence.at(-1)?.hash ?? "genesis";
      if (record.prevHash !== last) {
        throw new policyV2.persistence.PersistenceConflictError(
          "Does not link.",
        );
      }
      evidence.push(record);
    },
    async readEvidence() {
      return [...evidence];
    },
  };
  return store;
}

function service(
  store: PolicyV2StateStore,
  capabilities: string[] = [CAPABILITY],
): PolicyV2DecisionService {
  return new PolicyV2DecisionService({
    store,
    enabledCapabilities: new Set(capabilities),
    sources: async () => {
      throw new Error("no source");
    },
    now: () => NOW,
  });
}

const REQUEST = {
  capability: CAPABILITY,
  transactionId: "tx-1",
  target: "invoice-1",
  parameters: {},
  signals: {},
};

describe("createPolicyV2Decisions (environment)", () => {
  it("is off when the flag is unset or false", () => {
    expect(createPolicyV2Runtime({})).toBeUndefined();
    expect(
      createPolicyV2Runtime({ PARMANA_POLICY_V2_DECISIONS: "false" }),
    ).toBeUndefined();
  });

  it("refuses a flag that is not true or false", () => {
    expect(() =>
      createPolicyV2Runtime({ PARMANA_POLICY_V2_DECISIONS: "yes" }),
    ).toThrow(/must be "true" or "false"/);
  });

  it("refuses to start with no capability named", () => {
    expect(() =>
      createPolicyV2Runtime({ PARMANA_POLICY_V2_DECISIONS: "true" }),
    ).toThrow(/must name at least one capability/);
  });
});

describe("PolicyV2DecisionService", () => {
  it("refuses a capability that is not enabled before reading any state", async () => {
    const store = memoryStore();
    await expect(
      service(store, ["other:thing"]).decide(REQUEST, "partner-a"),
    ).rejects.toBeInstanceOf(PolicyV2NotEnabledError);
    expect(store.loads).toBe(0);
    expect(store.evidence).toHaveLength(0);
  });

  it("records a refusal when no policy is approved, and releases nothing", async () => {
    const store = memoryStore();
    const response = await service(store).decide(REQUEST, "partner-a");

    expect(response.outcome).toBe("REJECT");
    expect(response.released).toBe(false);
    expect(response.recordId).toBe("ev-1");
    expect(response.reviewId).toBeUndefined();
    expect(store.evidence).toHaveLength(1);
    expect(
      new policyV2.evidence.EvidenceLog().verifyChain(store.evidence),
    ).toBe(true);
  });

  it("links each decision to the one before it", async () => {
    const store = memoryStore();
    const svc = service(store);
    await svc.decide(REQUEST, "partner-a");
    const second = await svc.decide(
      { ...REQUEST, transactionId: "tx-2" },
      "partner-a",
    );

    expect(second.recordId).toBe("ev-2");
    expect(store.evidence[1]!.prevHash).toBe(store.evidence[0]!.hash);
    expect(
      new policyV2.evidence.EvidenceLog().verifyChain(store.evidence),
    ).toBe(true);
  });
});

describe("POST /v2/decisions", () => {
  function app(svc: PolicyV2DecisionService) {
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => {
      const caller = req.headers["x-caller"];
      if (typeof caller === "string") req.callerId = caller;
      next();
    });
    a.use("/v2/decisions", createPolicyV2DecisionsRouter(svc));
    return a;
  }

  it("returns 401 with no authenticated caller", async () => {
    const res = await request(app(service(memoryStore())))
      .post("/v2/decisions")
      .send(REQUEST);
    expect(res.status).toBe(401);
  });

  it("returns 400 for a malformed body", async () => {
    const res = await request(app(service(memoryStore())))
      .post("/v2/decisions")
      .set("x-caller", "partner-a")
      .send({ ...REQUEST, capability: "not a capability" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  it("returns 404 for a capability that is not enabled", async () => {
    const res = await request(app(service(memoryStore(), ["other:thing"])))
      .post("/v2/decisions")
      .set("x-caller", "partner-a")
      .send(REQUEST);
    expect(res.status).toBe(404);
  });

  it("returns the decision with released false", async () => {
    const res = await request(app(service(memoryStore())))
      .post("/v2/decisions")
      .set("x-caller", "partner-a")
      .send(REQUEST);
    expect(res.status).toBe(200);
    expect(res.body.released).toBe(false);
    expect(res.body.outcome).toBe("REJECT");
    expect(res.body.recordId).toBe("ev-1");
  });
});

describe("a decision under an approved policy", () => {
  it("decides with the approved version, not as a refusal for want of a policy", async () => {
    const owner: policyV2.register.Person = {
      id: "owner-1",
      roles: ["parmana-owner"],
    };
    const register = new policyV2.register.PolicyRegister(() => NOW);
    register.bootstrapOwner("owner-1");
    register.grantRole(owner, "action-1", "action-owner");
    register.grantRole(owner, "second-1", "second-approver");
    register.grantRole(owner, "gate-1", "gate-owner");
    register.registerAction(
      {
        capability: CAPABILITY,
        owner: "action-1",
        successor: "action-2",
        reviewers: ["rev-1", "rev-2", "rev-3"],
        review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
      },
      owner,
    );
    register.recordTest(CAPABILITY, "reject", {
      id: "gate-1",
      roles: ["gate-owner"],
    });
    const policy = {
      policyId: "minimal",
      policyVersion: "2.0.0",
      schemaVersion: "2.0.0",
      capability: CAPABILITY,
      description: "A minimal policy for tests.",
      owner: "finance-owner",
      signals: {
        requestedAmount: {
          type: "number",
          provenance: "untrusted",
          unit: "USD",
        },
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
    register.proposePolicy(policy, { id: "action-1", roles: [] });
    register.approvePolicy(CAPABILITY, "2.0.0", {
      id: "second-1",
      roles: ["second-approver"],
    });

    const store = memoryStore();
    await store.save("register", register.snapshot(), 0);
    const response = await service(store).decide(
      { ...REQUEST, signals: { requestedAmount: 100 } },
      "partner-a",
    );

    expect(response.outcome).toBe("REJECT");
    expect(response.refusal).toBeUndefined();
    expect(response.reason).toBe("Rejected.");
    expect(response.released).toBe(false);
  });
});
