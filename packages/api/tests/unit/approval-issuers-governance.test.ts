import { generateKeyPairSync } from "node:crypto";

import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PolicyChangeStepUpAuthorizationSigner } from "@parmana/crypto";
import { StaticApprovalIssuerRegistry } from "@parmana/approval";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import { AuthorityType, PendingPolicyChangeStatus } from "@parmana/shared";
import { MemoryApprovalIssuerRepository } from "@parmana/storage";

import { PolicyChangeStepUpVerifier } from "../../src/auth/PolicyChangeStepUpVerifier.js";
import { createApprovalIssuersRouter } from "../../src/routes/approval-issuers.js";

/**
 * Approver changes (RFC-0030 section 0, the maker-checker rules in
 * routes/approval-issuers.ts). Each rule is checked against the route with an
 * in-memory repository and a real step-up signature, so the test fails if a
 * refusal is removed.
 *
 * The caller is taken from headers: x-test-caller sets the caller id, and
 * x-test-holder sets the credential holder type (USER is a verified human).
 */

const stepUp = generateKeyPairSync("ed25519");
const stepUpSigner = new PolicyChangeStepUpAuthorizationSigner();

const approver = generateKeyPairSync("ed25519");
const approverPem = approver.publicKey
  .export({ format: "pem", type: "spki" })
  .toString();

const CODE_APPROVER = "code-approver";
const CODE_KEY = "code-key";

function codeRegistry(): StaticApprovalIssuerRegistry {
  return new StaticApprovalIssuerRegistry([
    {
      approverId: CODE_APPROVER,
      keyId: CODE_KEY,
      publicKey: approver.publicKey,
      revoked: false,
      capabilities: ["erp:invoice-pay"],
    },
  ]);
}

function app(repository: MemoryApprovalIssuerRepository) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    req.callerId = req.header("x-test-caller") ?? undefined;
    req.callerCredentialHolderType =
      (req.header("x-test-holder") as AuthorityType | undefined) ??
      AuthorityType.USER;
    req.callerStepUpPublicKey = stepUp.publicKey
      .export({ format: "pem", type: "spki" })
      .toString();
    next();
  });
  server.use(
    "/approval-issuers",
    createApprovalIssuersRouter(
      undefined,
      new PolicyChangeStepUpVerifier({ nonceStore: new MemoryNonceStore() }),
      repository,
      codeRegistry(),
    ),
  );
  return server;
}

function addBody(overrides: Record<string, unknown> = {}) {
  return {
    action: "add",
    approverId: "manager-priya",
    keyId: "manager-priya-key-1",
    publicKeyPem: approverPem,
    capabilities: ["erp:invoice-pay"],
    reason: "New approver for invoice payments.",
    ...overrides,
  };
}

async function stepUpFor(
  changeId: string,
  action: "approve" | "reject",
  pendingPolicyChangeId = changeId,
) {
  return stepUpSigner.sign(
    { pendingPolicyChangeId, action },
    stepUp.privateKey,
    "checker-key",
    120,
  );
}

describe("approver changes: who may propose and resolve them", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a proposal without an authenticated caller", async () => {
    const repository = new MemoryApprovalIssuerRepository();
    const server = app(repository);

    const response = await request(server)
      .post("/approval-issuers/changes")
      .send(addBody());

    expect(response.status).toBe(401);
    expect(await repository.listChanges()).toEqual([]);
  });

  it("refuses a proposal from a credential that is not a verified human", async () => {
    const repository = new MemoryApprovalIssuerRepository();
    const server = app(repository);

    const response = await request(server)
      .post("/approval-issuers/changes")
      .set("x-test-caller", "agent-7")
      .set("x-test-holder", AuthorityType.SERVICE)
      .send(addBody());

    expect(response.status).toBe(403);
    expect(await repository.listChanges()).toEqual([]);
  });

  it("refuses to add a key id that is already listed in code", async () => {
    const repository = new MemoryApprovalIssuerRepository();
    const server = app(repository);

    const response = await request(server)
      .post("/approval-issuers/changes")
      .set("x-test-caller", "maker")
      .send(addBody({ approverId: CODE_APPROVER, keyId: CODE_KEY }));

    expect(response.status).toBe(409);
    expect(await repository.listChanges()).toEqual([]);
  });

  it("records a proposal as pending, and applies nothing until it is approved", async () => {
    const repository = new MemoryApprovalIssuerRepository();
    const server = app(repository);

    const proposed = await request(server)
      .post("/approval-issuers/changes")
      .set("x-test-caller", "maker")
      .send(addBody());

    expect(proposed.status).toBe(201);
    const change = await repository.findChange(proposed.body.changeId);
    expect(change?.status).toBe(PendingPolicyChangeStatus.PENDING_APPROVAL);
    expect(
      await repository.findIssuer("manager-priya", "manager-priya-key-1"),
    ).toBeNull();
  });

  it("refuses the maker approving their own change", async () => {
    const repository = new MemoryApprovalIssuerRepository();
    const server = app(repository);

    const proposed = await request(server)
      .post("/approval-issuers/changes")
      .set("x-test-caller", "maker")
      .send(addBody());
    const changeId = proposed.body.changeId;

    const response = await request(server)
      .post(`/approval-issuers/changes/${changeId}/approve`)
      .set("x-test-caller", "maker")
      .send({ stepUpAuthorization: await stepUpFor(changeId, "approve") });

    expect(response.status).toBe(403);
    expect(
      await repository.findIssuer("manager-priya", "manager-priya-key-1"),
    ).toBeNull();
    expect((await repository.findChange(changeId))?.status).toBe(
      PendingPolicyChangeStatus.PENDING_APPROVAL,
    );
  });

  it("refuses a checker approval with no step-up authorization", async () => {
    const repository = new MemoryApprovalIssuerRepository();
    const server = app(repository);

    const proposed = await request(server)
      .post("/approval-issuers/changes")
      .set("x-test-caller", "maker")
      .send(addBody());
    const changeId = proposed.body.changeId;

    const response = await request(server)
      .post(`/approval-issuers/changes/${changeId}/approve`)
      .set("x-test-caller", "checker")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("STEP_UP_AUTHORIZATION_INVALID");
    expect(
      await repository.findIssuer("manager-priya", "manager-priya-key-1"),
    ).toBeNull();
  });

  it("refuses a step-up signed for a different change", async () => {
    const repository = new MemoryApprovalIssuerRepository();
    const server = app(repository);

    const proposed = await request(server)
      .post("/approval-issuers/changes")
      .set("x-test-caller", "maker")
      .send(addBody());
    const changeId = proposed.body.changeId;

    const response = await request(server)
      .post(`/approval-issuers/changes/${changeId}/approve`)
      .set("x-test-caller", "checker")
      .send({
        stepUpAuthorization: await stepUpFor(
          changeId,
          "approve",
          "some-other-change",
        ),
      });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("STEP_UP_AUTHORIZATION_INVALID");
    expect(
      await repository.findIssuer("manager-priya", "manager-priya-key-1"),
    ).toBeNull();
  });

  it("applies an approved add, so the key is trusted from then on", async () => {
    const repository = new MemoryApprovalIssuerRepository();
    const server = app(repository);

    const proposed = await request(server)
      .post("/approval-issuers/changes")
      .set("x-test-caller", "maker")
      .send(addBody());
    const changeId = proposed.body.changeId;

    const response = await request(server)
      .post(`/approval-issuers/changes/${changeId}/approve`)
      .set("x-test-caller", "checker")
      .send({ stepUpAuthorization: await stepUpFor(changeId, "approve") });

    expect(response.status).toBe(200);
    expect((await repository.findChange(changeId))?.status).toBe(
      PendingPolicyChangeStatus.APPROVED,
    );
    const issuer = await repository.findIssuer(
      "manager-priya",
      "manager-priya-key-1",
    );
    expect(issuer).not.toBeNull();
    expect(issuer?.revoked).toBe(false);
  });

  it("applies an approved revoke, and marks the key revoked", async () => {
    const repository = new MemoryApprovalIssuerRepository();
    const server = app(repository);

    const added = await request(server)
      .post("/approval-issuers/changes")
      .set("x-test-caller", "maker")
      .send(addBody());
    await request(server)
      .post(`/approval-issuers/changes/${added.body.changeId}/approve`)
      .set("x-test-caller", "checker")
      .send({
        stepUpAuthorization: await stepUpFor(added.body.changeId, "approve"),
      });

    const revoke = await request(server)
      .post("/approval-issuers/changes")
      .set("x-test-caller", "maker")
      .send({
        action: "revoke",
        approverId: "manager-priya",
        keyId: "manager-priya-key-1",
        reason: "Left the company.",
      });
    expect(revoke.status).toBe(201);

    const response = await request(server)
      .post(`/approval-issuers/changes/${revoke.body.changeId}/approve`)
      .set("x-test-caller", "checker")
      .send({
        stepUpAuthorization: await stepUpFor(revoke.body.changeId, "approve"),
      });

    expect(response.status).toBe(200);
    const issuer = await repository.findIssuer(
      "manager-priya",
      "manager-priya-key-1",
    );
    expect(issuer?.revoked).toBe(true);
  });

  it("rejects a change with a reason, and applies nothing", async () => {
    const repository = new MemoryApprovalIssuerRepository();
    const server = app(repository);

    const proposed = await request(server)
      .post("/approval-issuers/changes")
      .set("x-test-caller", "maker")
      .send(addBody());
    const changeId = proposed.body.changeId;

    const response = await request(server)
      .post(`/approval-issuers/changes/${changeId}/reject`)
      .set("x-test-caller", "checker")
      .send({
        rejectionReason: "Key was not verified in person.",
        stepUpAuthorization: await stepUpFor(changeId, "reject"),
      });

    expect(response.status).toBe(200);
    expect((await repository.findChange(changeId))?.status).toBe(
      PendingPolicyChangeStatus.REJECTED,
    );
    expect(
      await repository.findIssuer("manager-priya", "manager-priya-key-1"),
    ).toBeNull();
  });
});
