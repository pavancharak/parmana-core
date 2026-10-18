import { generateKeyPairSync } from "node:crypto";

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { PolicyChangeStepUpAuthorizationSigner } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import { AuthorityType } from "@parmana/shared";
import { MemoryAuthorityGrantRepository } from "@parmana/storage";

import { PolicyChangeStepUpVerifier } from "../../src/auth/PolicyChangeStepUpVerifier.js";
import { createAuthorityGrantsRouter } from "../../src/routes/authority-grants.js";

/**
 * /authority-grants with a clock the test controls: a grant whose
 * validUntil passes while it waits for a checker is refused on approval,
 * and nothing is granted.
 */
const stepUp = generateKeyPairSync("ed25519");
const signer = new PolicyChangeStepUpAuthorizationSigner();

function app(now: () => Date, repository: MemoryAuthorityGrantRepository) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    req.callerId = req.header("x-test-caller") ?? undefined;
    req.callerCredentialHolderType = AuthorityType.USER;
    req.callerStepUpPublicKey = stepUp.publicKey
      .export({ format: "pem", type: "spki" })
      .toString();
    next();
  });
  server.use(
    "/authority-grants",
    createAuthorityGrantsRouter(
      undefined,
      new PolicyChangeStepUpVerifier({ nonceStore: new MemoryNonceStore() }),
      repository,
      now,
    ),
  );
  return server;
}

describe("Authority grant approval and the clock", () => {
  it("refuses to approve a grant whose validUntil has passed, granting nothing", async () => {
    let clock = new Date("2026-10-11T00:00:00.000Z");
    const repository = new MemoryAuthorityGrantRepository();
    const server = app(() => clock, repository);

    const proposed = await request(server)
      .post("/authority-grants/changes")
      .set("x-test-caller", "maker")
      .send({
        action: "grant",
        callerId: "warehouse-agent",
        capability: "erp:release-goods",
        validUntil: "2026-10-12T00:00:00.000Z",
        reason: "One day.",
      });
    expect(proposed.status).toBe(201);

    clock = new Date("2026-10-12T00:00:00.000Z");
    vi.spyOn(console, "info").mockImplementation(() => {});

    const response = await request(server)
      .post(`/authority-grants/changes/${proposed.body.changeId}/approve`)
      .set("x-test-caller", "checker")
      .send({
        stepUpAuthorization: await signer.sign(
          { pendingPolicyChangeId: proposed.body.changeId, action: "approve" },
          stepUp.privateKey,
          "checker-key",
          120,
        ),
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error:
        "This grant's validUntil has passed. Reject it and propose a new one.",
      code: "INVALID_AUTHORITY_GRANT",
    });
    expect(await repository.listGrants()).toEqual([]);
    expect((await repository.findChange(proposed.body.changeId))?.status).toBe(
      "PENDING_APPROVAL",
    );
  });
});
