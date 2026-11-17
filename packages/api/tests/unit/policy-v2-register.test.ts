import express from "express";
import request from "supertest";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { policyV2 } from "@parmana/policy";

import {
  PolicyV2ForbiddenError,
  PolicyV2RegisterService,
  type PolicyV2RegisterStateStore,
} from "../../src/policyV2/policyV2Register.js";
import { createPolicyV2RegisterRouter } from "../../src/routes/policy-v2-register.js";
import { approverKeysFrom } from "../../src/policyV2/policyV2Decisions.js";

const NOW = new Date("2026-11-18T09:00:00Z");
const PEM = generateKeyPairSync("ed25519")
  .publicKey.export({ type: "spki", format: "pem" })
  .toString();

/**
 * An in-memory state store with the same rules as the database: a save with a stale version
 * writes neither the snapshot nor its audit rows.
 */
function memoryState() {
  let saved: { body: unknown; version: number } | undefined;
  const audit: policyV2.persistence.StoredAuditRow[] = [];
  const store: PolicyV2RegisterStateStore & {
    audit: typeof audit;
    saved: typeof saved;
  } = {
    audit,
    get saved() {
      return saved;
    },
    async load<T>() {
      return saved as { body: T; version: number } | undefined;
    },
    async saveWithAudit(_component, body, readVersion, events) {
      const current = saved?.version ?? 0;
      if (current !== readVersion) {
        throw new policyV2.persistence.PersistenceConflictError(
          "register changed.",
        );
      }
      saved = { body, version: current + 1 };
      for (const event of events)
        audit.push({ ...event, seq: audit.length + 1 });
      return current + 1;
    },
    async readAuditPage(_component, { after, limit }) {
      return audit.filter((row) => row.seq > after).slice(0, limit);
    },
  };
  return store;
}

async function serviceWithOwner(state = memoryState()) {
  const svc = new PolicyV2RegisterService({ state, now: () => NOW });
  await svc.bootstrapOwner("owner-1");
  return { svc, state };
}

const SOURCE = {
  name: "ledger",
  dataOwner: "finance",
  signer: { kind: "system" as const },
  keyId: "ledger-key",
  publicKeyPem: PEM,
  claims: { "funds.available": "" },
  canApprove: false,
};

describe("PolicyV2RegisterService", () => {
  it("refuses a caller that holds no register role", async () => {
    const { svc } = await serviceWithOwner();
    await expect(svc.read("stranger")).rejects.toBeInstanceOf(
      PolicyV2ForbiddenError,
    );
    await expect(svc.proposeSource("stranger", SOURCE)).rejects.toBeInstanceOf(
      PolicyV2ForbiddenError,
    );
  });

  it("sets up the first owner once", async () => {
    const { svc } = await serviceWithOwner();
    expect(await svc.bootstrapOwner("owner-2")).toBe(false);
  });

  it("lets only the Parmana owner grant a role", async () => {
    const { svc, state } = await serviceWithOwner();
    await svc.grantRole("owner-1", "source-1", "source-owner");
    await expect(
      svc.grantRole("source-1", "other", "reviewer"),
    ).rejects.toBeInstanceOf(policyV2.register.RegisterError);
    const body = state.saved!.body as policyV2.register.RegisterSnapshot;
    expect(body.roles).toContainEqual({
      callerId: "source-1",
      role: "source-owner",
    });
  });

  it("lets a source owner propose and a second approver approve a source", async () => {
    const { svc } = await serviceWithOwner();
    await svc.grantRole("owner-1", "source-1", "source-owner");
    await svc.grantRole("owner-1", "second-1", "second-approver");
    await svc.proposeSource("source-1", SOURCE);
    const approved = await svc.approveSource("second-1", "ledger");
    expect(approved.status).toBe("trusted");
  });

  it("refuses a change the register refuses, with its reason", async () => {
    const { svc } = await serviceWithOwner();
    await svc.grantRole("owner-1", "source-1", "source-owner");
    await expect(
      svc.proposeSource("source-1", { ...SOURCE, dataOwner: "<finance>" }),
    ).rejects.toBeInstanceOf(policyV2.register.RegisterError);
  });

  it("refuses to revoke the last Parmana owner", async () => {
    const { svc } = await serviceWithOwner();
    await expect(
      svc.revokeRole("owner-1", "owner-1", "parmana-owner"),
    ).rejects.toBeInstanceOf(policyV2.register.RegisterError);
  });

  it("saves each role change with its audit event", async () => {
    const { svc, state } = await serviceWithOwner();
    await svc.grantRole("owner-1", "source-1", "source-owner");
    expect(state.audit.map((e) => e.event)).toEqual([
      "role.bootstrap",
      "role.grant",
    ]);
    expect(state.audit[1]!.detail).toBe("source-1 source-owner");
  });

  it("writes neither the register nor its audit when the save is refused", async () => {
    const { svc, state } = await serviceWithOwner();
    const auditBefore = state.audit.length;
    const bodyBefore = JSON.stringify(state.saved);
    const staleLoad = state.load.bind(state);
    state.load = async <T>(component: "register") => {
      const current = (await staleLoad(component)) as
        { body: T; version: number } | undefined;
      return current === undefined
        ? undefined
        : { body: current.body, version: current.version - 1 };
    };
    await expect(
      svc.grantRole("owner-1", "x", "reviewer"),
    ).rejects.toBeInstanceOf(policyV2.persistence.PersistenceConflictError);
    expect(state.audit).toHaveLength(auditBefore);
    expect(JSON.stringify(state.saved)).toBe(bodyBefore);
  });

  it("returns the audit log to a caller with a role", async () => {
    const { svc } = await serviceWithOwner();
    const page = await svc.auditPage("owner-1", { after: 0, limit: 2 });
    expect(page.events.map((e) => e.event)).toEqual(["role.bootstrap"]);
    expect(page.next).toBeNull();
  });

  it("pages the audit log, with a cursor until the last page", async () => {
    const { svc } = await serviceWithOwner();
    await svc.grantRole("owner-1", "a", "reviewer");
    await svc.grantRole("owner-1", "b", "reviewer");

    const first = await svc.auditPage("owner-1", { after: 0, limit: 2 });
    expect(first.events.map((e) => e.event)).toEqual([
      "role.bootstrap",
      "role.grant",
    ]);
    expect(first.next).toBe(2);

    const second = await svc.auditPage("owner-1", {
      after: first.next!,
      limit: 2,
    });
    expect(second.events.map((e) => e.event)).toEqual(["role.grant"]);
    expect(second.next).toBeNull();
  });
});

describe("approver keys through the service", () => {
  const KEY = { approverId: "approver-1", keyId: "k1", publicKeyPem: PEM };

  it("activates a key only after the owner proposes it and a second approver confirms it", async () => {
    const { svc } = await serviceWithOwner();
    await svc.grantRole("owner-1", "second-1", "second-approver");
    await svc.proposeApproverKey("owner-1", KEY);
    expect((await svc.read("owner-1")).approverKeys[0]!.status).toBe("pending");
    await svc.approveApproverKey("second-1", "approver-1", "k1");
    expect((await svc.read("owner-1")).approverKeys[0]!.status).toBe("active");
  });

  it("refuses a key proposal from a caller who is not the Parmana owner", async () => {
    const { svc } = await serviceWithOwner();
    await svc.grantRole("owner-1", "source-1", "source-owner");
    await expect(
      svc.proposeApproverKey("source-1", KEY),
    ).rejects.toBeInstanceOf(policyV2.register.RegisterError);
  });
});

const KEY_FOR_ROUTE = {
  approverId: "approver-1",
  keyId: "k1",
  publicKeyPem: PEM,
};

describe("POST /v2/register", () => {
  function app(svc: PolicyV2RegisterService) {
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => {
      const caller = req.headers["x-caller"];
      if (typeof caller === "string") req.callerId = caller;
      next();
    });
    a.use("/v2/register", createPolicyV2RegisterRouter(svc));
    return a;
  }

  it("returns 401 with no caller", async () => {
    const { svc } = await serviceWithOwner();
    expect((await request(app(svc)).get("/v2/register")).status).toBe(401);
  });

  it("returns 403 for a caller with no role", async () => {
    const { svc } = await serviceWithOwner();
    const res = await request(app(svc))
      .get("/v2/register")
      .set("x-caller", "stranger");
    expect(res.status).toBe(403);
  });

  it("returns 400 for an unknown role", async () => {
    const { svc } = await serviceWithOwner();
    const res = await request(app(svc))
      .post("/v2/register/roles/grant")
      .set("x-caller", "owner-1")
      .send({ callerId: "x", role: "emperor" });
    expect(res.status).toBe(400);
  });

  it("returns 422 when a confirmation comes from a caller without the second-approver role", async () => {
    const { svc } = await serviceWithOwner();
    await svc.proposeApproverKey("owner-1", KEY_FOR_ROUTE);
    const res = await request(app(svc))
      .post("/v2/register/approver-keys/approver-1/k1/approve")
      .set("x-caller", "owner-1");
    expect(res.status).toBe(422);
  });

  it("returns 422 with the reason for a refused change", async () => {
    const { svc } = await serviceWithOwner();
    await svc.grantRole("owner-1", "source-1", "source-owner");
    const res = await request(app(svc))
      .post("/v2/register/sources")
      .set("x-caller", "source-1")
      .send({ ...SOURCE, dataOwner: "<finance>" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("refused");
  });

  it("returns 422 when a non-owner grants a role", async () => {
    const { svc } = await serviceWithOwner();
    await svc.grantRole("owner-1", "source-1", "source-owner");
    const res = await request(app(svc))
      .post("/v2/register/roles/grant")
      .set("x-caller", "source-1")
      .send({ callerId: "x", role: "reviewer" });
    expect(res.status).toBe(422);
  });

  it("returns the register and its audit log to a caller with a role", async () => {
    const { svc } = await serviceWithOwner();
    const register = await request(app(svc))
      .get("/v2/register")
      .set("x-caller", "owner-1");
    expect(register.status).toBe(200);
    expect(register.body).toEqual({
      sources: [],
      thresholds: [],
      actions: [],
      approverKeys: [],
      policyVersions: [],
      reviewGrants: [],
    });
    const audit = await request(app(svc))
      .get("/v2/register/audit")
      .set("x-caller", "owner-1");
    expect(audit.body.events.map((e: { event: string }) => e.event)).toEqual([
      "role.bootstrap",
    ]);
    expect(audit.body.next).toBeNull();
  });

  it("returns 400 for a page size that is out of range", async () => {
    const { svc } = await serviceWithOwner();
    const res = await request(app(svc))
      .get("/v2/register/audit?limit=100000")
      .set("x-caller", "owner-1");
    expect(res.status).toBe(400);
  });
});

describe("the approver keys the decision service reads", () => {
  const KEY = { approverId: "approver-1", keyId: "k1", publicKeyPem: PEM };

  function registerWith(steps: "pending" | "active" | "revoked") {
    const r = new policyV2.register.PolicyRegister(() => NOW);
    r.bootstrapOwner("owner-1");
    r.grantRole({ id: "owner-1", roles: [] }, "second-1", "second-approver");
    r.proposeApproverKey(KEY, { id: "owner-1", roles: [] });
    if (steps !== "pending")
      r.approveApproverKey("approver-1", "k1", { id: "second-1", roles: [] });
    if (steps === "revoked")
      r.revokeApproverKey(
        "approver-1",
        "k1",
        { id: "owner-1", roles: [] },
        "lost",
      );
    return r;
  }

  it("does not read a pending key", () => {
    const keys = approverKeysFrom(registerWith("pending"));
    expect(keys.keyFor("approver-1", "k1")).toBeUndefined();
  });

  it("reads an active key", () => {
    const keys = approverKeysFrom(registerWith("active"));
    expect(keys.keyFor("approver-1", "k1")).toBeDefined();
    expect(keys.keyFor("approver-1", "k1")).not.toBe("revoked");
  });

  it("names a revoked key as revoked", () => {
    const keys = approverKeysFrom(registerWith("revoked"));
    expect(keys.keyFor("approver-1", "k1")).toBe("revoked");
  });
});

describe("policy versions through the service", () => {
  it("proposes a policy as the action owner, and makes it the approved version once a second approver approves it", async () => {
    const { svc, state } = await serviceWithOwner();
    await svc.grantRole("owner-1", "action-1", "action-owner");
    await svc.grantRole("owner-1", "second-1", "second-approver");
    await svc.registerAction("owner-1", {
      capability: "erp:pay-invoice",
      owner: "action-1",
      successor: "action-2",
      reviewers: ["rev-1", "rev-2", "rev-3"],
      review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
    });
    const policy = {
      policyId: "minimal",
      policyVersion: "2.0.0",
      schemaVersion: "2.0.0",
      capability: "erp:pay-invoice",
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
    const proposed = await svc.proposePolicy("action-1", policy);
    expect(proposed.status).toBe("proposed");
    const approved = await svc.approvePolicy(
      "second-1",
      "erp:pay-invoice",
      "2.0.0",
    );
    expect(approved.status).toBe("approved");
    expect(state.saved).toBeDefined();
  });

  it("refuses a policy proposal from anyone but the action owner", async () => {
    const { svc } = await serviceWithOwner();
    await expect(
      svc.proposePolicy("owner-1", {
        capability: "erp:pay-invoice",
        policyVersion: "2.0.0",
      }),
    ).rejects.toBeInstanceOf(policyV2.register.RegisterError);
  });
});

describe("the go-live gate through the routes", () => {
  const CAP = "erp:pay-invoice";
  const policy = {
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

  function app(svc: PolicyV2RegisterService) {
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => {
      const caller = req.headers["x-caller"];
      if (typeof caller === "string") req.callerId = caller;
      next();
    });
    a.use("/v2/register", createPolicyV2RegisterRouter(svc));
    return a;
  }

  it("refuses a test record from a caller without the gate-owner role", async () => {
    const { svc } = await serviceWithOwner();
    const res = await request(app(svc))
      .post(`/v2/register/actions/${CAP}/tests`)
      .set("x-caller", "owner-1")
      .send({ tier: "reject" });
    expect(res.status).toBe(422);
  });

  it("reads the checklist, and refuses a go-live run that is not passed with the missing items", async () => {
    const { svc } = await serviceWithOwner();
    await svc.grantRole("owner-1", "gate-1", "gate-owner");
    await svc.grantRole("owner-1", "action-1", "action-owner");
    await svc.registerAction("owner-1", {
      capability: CAP,
      owner: "action-1",
      successor: "action-2",
      reviewers: ["rev-1", "rev-2", "rev-3"],
      review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
    });
    const checklist = await request(app(svc))
      .get(`/v2/register/actions/${CAP}/go-live`)
      .set("x-caller", "gate-1");
    expect(checklist.body.missing).toEqual(["an approved policy version"]);
    const refused = await request(app(svc))
      .post(`/v2/register/actions/${CAP}/go-live`)
      .set("x-caller", "gate-1");
    expect(refused.status).toBe(422);
    expect(refused.body.message).toMatch(/approved policy version/);
  });

  it("takes an action live through the routes once every item is in place", async () => {
    const { svc } = await serviceWithOwner();
    await svc.grantRole("owner-1", "action-1", "action-owner");
    await svc.grantRole("owner-1", "second-1", "second-approver");
    await svc.grantRole("owner-1", "gate-1", "gate-owner");
    await svc.grantRole("owner-1", "gate-2", "gate-owner");
    await svc.registerAction("owner-1", {
      capability: CAP,
      owner: "action-1",
      successor: "action-2",
      reviewers: ["rev-1", "rev-2", "rev-3"],
      review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
    });
    await svc.proposePolicy("action-1", policy);
    await svc.approvePolicy("second-1", CAP, "2.0.0");

    const test = await request(app(svc))
      .post(`/v2/register/actions/${CAP}/tests`)
      .set("x-caller", "gate-1")
      .send({ tier: "reject" });
    expect(test.status).toBe(200);

    const live = await request(app(svc))
      .post(`/v2/register/actions/${CAP}/go-live`)
      .set("x-caller", "gate-1");
    expect(live.status).toBe(200);
    expect(live.body).toEqual({ live: true });
  });
});

describe("reviewer grants through the routes", () => {
  const CAP = "erp:pay-invoice";

  function app(svc: PolicyV2RegisterService) {
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => {
      const caller = req.headers["x-caller"];
      if (typeof caller === "string") req.callerId = caller;
      next();
    });
    a.use("/v2/register", createPolicyV2RegisterRouter(svc));
    return a;
  }

  async function withAction() {
    const { svc } = await serviceWithOwner();
    await svc.grantRole("owner-1", "action-1", "action-owner");
    await svc.grantRole("owner-1", "rev-1", "reviewer");
    await svc.registerAction("owner-1", {
      capability: CAP,
      owner: "action-1",
      successor: "action-2",
      reviewers: ["rev-1", "rev-2", "rev-3"],
      review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
    });
    return svc;
  }

  it("grants a review from the action owner, and refuses one from anyone else", async () => {
    const svc = await withAction();
    const granted = await request(app(svc))
      .post(`/v2/register/actions/${CAP}/reviewers`)
      .set("x-caller", "action-1")
      .send({ reviewerId: "rev-1", maxAmount: 5000 });
    expect(granted.status).toBe(200);
    expect(granted.body.status).toBe("active");

    const refused = await request(app(svc))
      .post(`/v2/register/actions/${CAP}/reviewers`)
      .set("x-caller", "rev-1")
      .send({ reviewerId: "rev-1" });
    expect(refused.status).toBe(422);
  });

  it("returns 400 for a grant with no reviewer, or an amount that is not a number", async () => {
    const svc = await withAction();
    const missing = await request(app(svc))
      .post(`/v2/register/actions/${CAP}/reviewers`)
      .set("x-caller", "action-1")
      .send({});
    expect(missing.status).toBe(400);
    const badAmount = await request(app(svc))
      .post(`/v2/register/actions/${CAP}/reviewers`)
      .set("x-caller", "action-1")
      .send({ reviewerId: "rev-1", maxAmount: "lots" });
    expect(badAmount.status).toBe(400);
  });

  it("revokes a grant with a reason, and returns 400 without one", async () => {
    const svc = await withAction();
    await svc.grantReview("action-1", CAP, "rev-1");
    const noReason = await request(app(svc))
      .post(`/v2/register/actions/${CAP}/reviewers/rev-1/revoke`)
      .set("x-caller", "action-1")
      .send({});
    expect(noReason.status).toBe(400);
    const revoked = await request(app(svc))
      .post(`/v2/register/actions/${CAP}/reviewers/rev-1/revoke`)
      .set("x-caller", "action-1")
      .send({ reason: "left the team" });
    expect(revoked.status).toBe(200);
    expect(revoked.body.status).toBe("revoked");
  });
});

describe("contacts through the routes", () => {
  it("sets a contact for the Parmana owner, and refuses one from anyone else", async () => {
    const { svc } = await serviceWithOwner();
    await svc.grantRole("owner-1", "rev-1", "reviewer");
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const caller = req.headers["x-caller"];
      if (typeof caller === "string") req.callerId = caller;
      next();
    });
    app.use("/v2/register", createPolicyV2RegisterRouter(svc));
    const refused = await request(app)
      .post("/v2/register/contacts")
      .set("x-caller", "rev-1")
      .send({ personId: "rev-1", email: "r@example.com" });
    expect(refused.status).toBe(422);
    const ok = await request(app)
      .post("/v2/register/contacts")
      .set("x-caller", "owner-1")
      .send({ personId: "rev-1", email: "r@example.com" });
    expect(ok.status).toBe(200);
    expect(ok.body.email).toBe("r@example.com");
  });
});
