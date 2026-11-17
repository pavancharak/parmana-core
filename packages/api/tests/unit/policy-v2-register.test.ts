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
  const audit: policyV2.persistence.AuditRow[] = [];
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
      audit.push(...events);
      return current + 1;
    },
    async readAudit() {
      return [...audit];
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
    const audit = await svc.auditLog("owner-1");
    expect(audit.map((e) => e.event)).toEqual(["role.bootstrap"]);
  });
});

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
    expect(register.body).toEqual({ sources: [], thresholds: [], actions: [] });
    const audit = await request(app(svc))
      .get("/v2/register/audit")
      .set("x-caller", "owner-1");
    expect(audit.body.events.map((e: { event: string }) => e.event)).toEqual([
      "role.bootstrap",
    ]);
  });
});
