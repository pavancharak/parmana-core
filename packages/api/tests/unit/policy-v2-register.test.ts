import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { policyV2 } from "@parmana/policy";

import {
  PolicyV2ForbiddenError,
  PolicyV2RegisterService,
  type PolicyV2RoleStoreLike,
} from "../../src/policyV2/policyV2Register.js";
import { createPolicyV2RegisterRouter } from "../../src/routes/policy-v2-register.js";

const NOW = new Date("2026-11-18T09:00:00Z");
const PEM = generateKeyPairSync("ed25519")
  .publicKey.export({ type: "spki", format: "pem" })
  .toString();

/** Roles as an append-only event list, with the same last-owner guard as the database store. */
function memoryRoles(
  initial: Array<[string, string]> = [],
): PolicyV2RoleStoreLike & {
  events: Array<{ callerId: string; role: string; action: string }>;
} {
  const events: Array<{ callerId: string; role: string; action: string }> =
    initial.map(([callerId, role]) => ({ callerId, role, action: "grant" }));
  const holds = (callerId: string, role: string) => {
    const latest = [...events]
      .reverse()
      .find((e) => e.callerId === callerId && e.role === role);
    return latest?.action === "grant";
  };
  return {
    events,
    async rolesOf(callerId) {
      const roles = new Set(
        events.filter((e) => e.callerId === callerId).map((e) => e.role),
      );
      return [...roles].filter((role) => holds(callerId, role)).sort();
    },
    async changeRole({ callerId, role, action }) {
      if (action === "revoke" && role === "parmana-owner") {
        const owners = new Set(
          events
            .filter((e) => e.role === "parmana-owner")
            .map((e) => e.callerId),
        );
        const holders = [...owners].filter((o) => holds(o, "parmana-owner"));
        if (holders.length === 1 && holders[0] === callerId) {
          throw new policyV2.persistence.RoleChangeError(
            "The last Parmana owner cannot be revoked.",
          );
        }
      }
      events.push({ callerId, role, action });
    },
  };
}

/** A state store that enforces versions, so a stale save is refused. */
function memoryState() {
  let saved: { body: unknown; version: number } | undefined;
  return {
    get saved() {
      return saved;
    },
    async load<T>() {
      return saved as { body: T; version: number } | undefined;
    },
    async save(_component: "register", body: unknown, readVersion: number) {
      const current = saved?.version ?? 0;
      if (current !== readVersion) {
        throw new policyV2.persistence.PersistenceConflictError(
          "register changed.",
        );
      }
      saved = { body, version: current + 1 };
      return current + 1;
    },
  };
}

function service(
  roles = memoryRoles([["owner-1", "parmana-owner"]]),
  state = memoryState(),
) {
  return {
    service: new PolicyV2RegisterService({ state, roles, now: () => NOW }),
    roles,
    state,
  };
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
    const { service: svc } = service();
    await expect(svc.read("stranger")).rejects.toBeInstanceOf(
      PolicyV2ForbiddenError,
    );
    await expect(svc.proposeSource("stranger", SOURCE)).rejects.toBeInstanceOf(
      PolicyV2ForbiddenError,
    );
  });

  it("lets only the Parmana owner grant a role", async () => {
    const { service: svc, roles } = service(
      memoryRoles([
        ["owner-1", "parmana-owner"],
        ["source-1", "source-owner"],
      ]),
    );
    await expect(
      svc.grantRole("source-1", "other", "source-owner"),
    ).rejects.toBeInstanceOf(PolicyV2ForbiddenError);
    await svc.grantRole("owner-1", "other", "source-owner");
    expect(await roles.rolesOf("other")).toEqual(["source-owner"]);
  });

  it("lets a source owner propose and a second approver approve a source", async () => {
    const { service: svc, roles } = service(
      memoryRoles([
        ["owner-1", "parmana-owner"],
        ["source-1", "source-owner"],
        ["second-1", "second-approver"],
      ]),
    );
    await svc.proposeSource("source-1", SOURCE);
    const approved = await svc.approveSource("second-1", "ledger");
    expect(approved.status).toBe("trusted");
    expect(await roles.rolesOf("second-1")).toEqual(["second-approver"]);
  });

  it("refuses a change the register refuses, with its reason", async () => {
    const { service: svc } = service(
      memoryRoles([
        ["owner-1", "parmana-owner"],
        ["source-1", "source-owner"],
      ]),
    );
    await expect(
      svc.proposeSource("source-1", { ...SOURCE, dataOwner: "<finance>" }),
    ).rejects.toBeInstanceOf(policyV2.register.RegisterError);
  });

  it("refuses to revoke the last Parmana owner", async () => {
    const { service: svc } = service();
    await expect(
      svc.revokeRole("owner-1", "owner-1", "parmana-owner"),
    ).rejects.toBeInstanceOf(policyV2.persistence.RoleChangeError);
  });

  it("writes every role change to the register's audit log", async () => {
    const { service: svc, state } = service();
    await svc.grantRole("owner-1", "source-1", "source-owner");
    const log = (state.saved!.body as policyV2.register.RegisterSnapshot).log;
    expect(log.map((e) => e.event)).toContain("role.grant");
    expect(log.find((e) => e.event === "role.grant")!.detail).toBe(
      "source-1 source-owner",
    );
  });

  it("refuses a save that read a stale version", async () => {
    const state = memoryState();
    const { service: svc } = service(undefined, state);
    await svc.grantRole("owner-1", "source-1", "source-owner");
    const staleLoad = state.load.bind(state);
    state.load = async <T>() => {
      const current = (await staleLoad()) as
        { body: T; version: number } | undefined;
      return current === undefined
        ? undefined
        : { body: current.body, version: current.version - 1 };
    };
    await expect(
      svc.grantRole("owner-1", "x", "reviewer"),
    ).rejects.toBeInstanceOf(policyV2.persistence.PersistenceConflictError);
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
    const res = await request(app(service().service)).get("/v2/register");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a caller with no role", async () => {
    const res = await request(app(service().service))
      .get("/v2/register")
      .set("x-caller", "stranger");
    expect(res.status).toBe(403);
  });

  it("returns 400 for an unknown role", async () => {
    const res = await request(app(service().service))
      .post("/v2/register/roles/grant")
      .set("x-caller", "owner-1")
      .send({ callerId: "x", role: "emperor" });
    expect(res.status).toBe(400);
  });

  it("returns 422 with the reason for a refused change", async () => {
    const res = await request(
      app(
        service(
          memoryRoles([
            ["owner-1", "parmana-owner"],
            ["source-1", "source-owner"],
          ]),
        ).service,
      ),
    )
      .post("/v2/register/sources")
      .set("x-caller", "source-1")
      .send({ ...SOURCE, dataOwner: "<finance>" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("refused");
  });

  it("returns 403 when a non-owner grants a role", async () => {
    const res = await request(
      app(
        service(
          memoryRoles([
            ["owner-1", "parmana-owner"],
            ["source-1", "source-owner"],
          ]),
        ).service,
      ),
    )
      .post("/v2/register/roles/grant")
      .set("x-caller", "source-1")
      .send({ callerId: "x", role: "reviewer" });
    expect(res.status).toBe(403);
  });

  it("returns the register to a caller with a role", async () => {
    const res = await request(app(service().service))
      .get("/v2/register")
      .set("x-caller", "owner-1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sources: [], thresholds: [], actions: [] });
  });
});
