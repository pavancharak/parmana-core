import { generateKeyPairSync } from "node:crypto";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { AuthorityType } from "@parmana/shared";
import type { PolicyChangeStepUpAuthorization } from "@parmana/shared";
import { PolicyChangeStepUpAuthorizationSigner } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";
import { PolicyChangeStepUpVerifier } from "../../src/auth/PolicyChangeStepUpVerifier.js";

import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

/**
 * Per-agent authority grants (RFC-0023 phase 3), at the HTTP boundary:
 * human callers only, maker is not checker, step up on approve and
 * reject, no one grants authority to themselves, a grant must expire
 * within 366 days, and limits are checked when proposed.
 */
describe("Authority grant changes (HTTP boundary)", () => {
  const MAKER_KEY = "grant-human-maker-raw-key-for-tests-only";
  const CHECKER_KEY = "grant-human-checker-raw-key-for-tests-only";
  const SERVICE_KEY = "grant-service-caller-raw-key-for-tests-only";

  const checkerStepUp = generateKeyPairSync("ed25519");
  const stepUpSigner = new PolicyChangeStepUpAuthorizationSigner();

  const DAY = 86_400_000;
  const inDays = (days: number) =>
    new Date(Date.now() + days * DAY).toISOString();

  function signStepUp(
    changeId: string,
    action: "approve" | "reject",
  ): Promise<PolicyChangeStepUpAuthorization> {
    return stepUpSigner.sign(
      { pendingPolicyChangeId: changeId, action },
      checkerStepUp.privateKey,
      "checker-step-up-key",
      120,
    );
  }

  function governanceApp() {
    const { executionSystem } = createInspectableExecutionSystem();

    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "grant-maker",
        keyHash: hashApiKey(MAKER_KEY),
        credentialHolderType: AuthorityType.USER,
      },
      {
        callerId: "grant-checker",
        keyHash: hashApiKey(CHECKER_KEY),
        credentialHolderType: AuthorityType.USER,
        stepUpPublicKey: checkerStepUp.publicKey
          .export({ format: "pem", type: "spki" })
          .toString(),
      },
      {
        callerId: "grant-service",
        keyHash: hashApiKey(SERVICE_KEY),
        credentialHolderType: AuthorityType.SERVICE,
      },
    ]);

    return createApp(createApplication(executionSystem), {
      callerAuth: { authenticator, auditSink: new InMemoryCallerAuditSink() },
      stepUpVerifier: new PolicyChangeStepUpVerifier({
        nonceStore: new MemoryNonceStore(),
      }),
    });
  }

  let sequence = 0;

  /** The repository is shared by every test in this process. */
  function uniqueAgent(): string {
    sequence += 1;
    return `agent-${Date.now()}-${sequence}`;
  }

  function grant(callerId: string): Record<string, unknown> {
    return {
      action: "grant",
      callerId,
      capability: "erp:release-goods",
      limits: {
        "parameters.amount": { max: 100000 },
        "parameters.currency": { oneOf: ["INR"] },
      },
      validUntil: inDays(30),
    };
  }

  async function propose(
    app: ReturnType<typeof governanceApp>,
    body: Record<string, unknown>,
    key = MAKER_KEY,
  ) {
    return request(app)
      .post("/authority-grants/changes")
      .set("Authorization", `Bearer ${key}`)
      .send({ reason: "Test.", ...body });
  }

  async function approve(
    app: ReturnType<typeof governanceApp>,
    id: string,
    key = CHECKER_KEY,
  ) {
    return request(app)
      .post(`/authority-grants/changes/${id}/approve`)
      .set("Authorization", `Bearer ${key}`)
      .send({ stepUpAuthorization: await signStepUp(id, "approve") });
  }

  async function grants(app: ReturnType<typeof governanceApp>) {
    const response = await request(app)
      .get("/authority-grants")
      .set("Authorization", `Bearer ${CHECKER_KEY}`);

    expect(response.status).toBe(200);

    return response.body.grants as Array<Record<string, unknown>>;
  }

  describe("who may propose, approve and reject", () => {
    it("refuses a caller with no credential, and a service credential", async () => {
      const app = governanceApp();

      expect((await request(app).get("/authority-grants")).status).toBe(401);

      const service = await propose(app, grant(uniqueAgent()), SERVICE_KEY);
      expect(service.status).toBe(403);
      expect(service.body.code).toBe("NON_HUMAN_CALLER_DENIED");
    });

    it("refuses granting authority to oneself", async () => {
      const app = governanceApp();

      const self = await propose(app, grant("grant-maker"));

      expect(self.status).toBe(403);
      expect(self.body.code).toBe("AUTHORITY_SELF_GRANT_DENIED");
    });

    it("refuses the grantee as checker", async () => {
      const app = governanceApp();
      const proposed = await propose(app, grant("grant-checker"));
      expect(proposed.status).toBe(201);

      const response = await approve(app, proposed.body.changeId);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("AUTHORITY_SELF_GRANT_DENIED");
    });

    it("refuses the proposer as checker", async () => {
      const app = governanceApp();
      const proposed = await propose(app, grant(uniqueAgent()));

      const response = await approve(app, proposed.body.changeId, MAKER_KEY);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE");
    });

    it("refuses an approval with no step up", async () => {
      const app = governanceApp();
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const proposed = await propose(app, grant(uniqueAgent()));

      const none = await request(app)
        .post(`/authority-grants/changes/${proposed.body.changeId}/approve`)
        .set("Authorization", `Bearer ${CHECKER_KEY}`)
        .send({});

      expect(none.status).toBe(403);
      expect(none.body.code).toBe("STEP_UP_AUTHORIZATION_INVALID");
      errors.mockRestore();
    });

    it("answers 404 for an unknown change", async () => {
      const app = governanceApp();

      const response = await approve(
        app,
        "00000000-0000-0000-0000-000000000000",
      );

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("AUTHORITY_GRANT_CHANGE_NOT_FOUND");
    });
  });

  describe("what may be proposed", () => {
    it("refuses malformed fields, limits and expiry", async () => {
      const app = governanceApp();
      const callerId = uniqueAgent();
      const valid = grant(callerId);

      const cases = [
        { ...valid, action: "allow" },
        { ...valid, callerId: "" },
        { ...valid, callerId: "has space" },
        { ...valid, capability: "release-goods" },
        { ...valid, capability: "ERP:Release" },
        { ...valid, validUntil: undefined },
        { ...valid, validUntil: "next week" },
        { ...valid, validUntil: inDays(-1) },
        { ...valid, validUntil: inDays(400) },
        { ...valid, validFrom: inDays(10), validUntil: inDays(5) },
        { ...valid, limits: [] },
        { ...valid, limits: {} },
        { ...valid, limits: { amount: { max: 1 } } },
        { ...valid, limits: { "parameters.amount": {} } },
        { ...valid, limits: { "parameters.amount": { max: "1" } } },
        { ...valid, limits: { "parameters.amount": { min: 5, max: 1 } } },
        { ...valid, limits: { "parameters.amount": { below: 1 } } },
        { ...valid, limits: { "parameters.currency": { oneOf: [] } } },
        { ...valid, limits: { "parameters.currency": { oneOf: [true] } } },
        { ...valid, reason: " " },
        {
          action: "revoke",
          callerId,
          capability: "erp:release-goods",
          validUntil: inDays(1),
        },
      ];

      for (const body of cases) {
        const response = await propose(app, body);

        expect(response.status, JSON.stringify(body)).toBe(400);
        expect(response.body.code).toBe("INVALID_AUTHORITY_GRANT");
      }
    });

    it("refuses a second pending change for the same caller and capability, and revoking one never made", async () => {
      const app = governanceApp();
      const callerId = uniqueAgent();

      expect((await propose(app, grant(callerId))).status).toBe(201);
      expect((await propose(app, grant(callerId))).status).toBe(409);
      expect(
        (
          await propose(app, {
            action: "revoke",
            callerId: uniqueAgent(),
            capability: "erp:release-goods",
          })
        ).status,
      ).toBe(409);
    });
  });

  describe("grant, then revoke", () => {
    it("stores the grant only on approval, keeps one active per caller and capability, and revokes without deleting", async () => {
      const app = governanceApp();
      const callerId = uniqueAgent();

      const proposed = await propose(app, grant(callerId));
      expect(proposed.status).toBe(201);
      expect(proposed.body).toMatchObject({
        action: "grant",
        callerId,
        capability: "erp:release-goods",
        limits: { "parameters.amount": { max: 100000 } },
        status: "PENDING_APPROVAL",
        proposedBy: "grant-maker",
      });
      expect(proposed.body.validFrom).toBeUndefined();

      expect((await grants(app)).some((g) => g.callerId === callerId)).toBe(
        false,
      );

      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      const approved = await approve(app, proposed.body.changeId);
      expect(approved.status).toBe(200);
      expect(approved.body).toMatchObject({
        status: "APPROVED",
        resolvedBy: "grant-checker",
      });
      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "authority_grant_change_approved",
          callerId,
        }),
      );

      const active = (await grants(app)).find((g) => g.callerId === callerId);
      expect(active).toMatchObject({
        grantId: proposed.body.changeId,
        capability: "erp:release-goods",
        status: "active",
        validUntil: proposed.body.validUntil,
      });
      // With no validFrom, the grant starts when it is approved.
      expect(active?.validFrom).toBe(approved.body.resolvedAt);

      expect((await propose(app, grant(callerId))).status).toBe(409);

      const revoke = await propose(app, {
        action: "revoke",
        callerId,
        capability: "erp:release-goods",
      });
      expect(revoke.status).toBe(201);
      expect((await approve(app, revoke.body.changeId)).status).toBe(200);
      info.mockRestore();

      expect(
        (await grants(app)).find((g) => g.callerId === callerId),
      ).toMatchObject({
        grantId: proposed.body.changeId,
        status: "revoked",
        revokedByChangeId: revoke.body.changeId,
      });

      expect((await propose(app, grant(callerId))).status).toBe(201);
    });

    it("keeps a validFrom in the future", async () => {
      const app = governanceApp();
      const callerId = uniqueAgent();
      const validFrom = inDays(2);

      const proposed = await propose(app, {
        ...grant(callerId),
        validFrom,
      });
      expect(proposed.status).toBe(201);

      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      expect((await approve(app, proposed.body.changeId)).status).toBe(200);
      info.mockRestore();

      expect(
        (await grants(app)).find((g) => g.callerId === callerId)?.validFrom,
      ).toBe(validFrom);
    });
  });

  describe("reject", () => {
    it("needs a reason, resolves once, and grants nothing", async () => {
      const app = governanceApp();
      const callerId = uniqueAgent();
      const proposed = await propose(app, grant(callerId));
      const id = proposed.body.changeId;

      const noReason = await request(app)
        .post(`/authority-grants/changes/${id}/reject`)
        .set("Authorization", `Bearer ${CHECKER_KEY}`)
        .send({ stepUpAuthorization: await signStepUp(id, "reject") });
      expect(noReason.status).toBe(400);

      const rejected = await request(app)
        .post(`/authority-grants/changes/${id}/reject`)
        .set("Authorization", `Bearer ${CHECKER_KEY}`)
        .send({
          rejectionReason: "Lower the limit.",
          stepUpAuthorization: await signStepUp(id, "reject"),
        });
      expect(rejected.status).toBe(200);
      expect(rejected.body).toMatchObject({
        status: "REJECTED",
        rejectionReason: "Lower the limit.",
      });

      const again = await approve(app, id);
      expect(again.status).toBe(409);

      expect((await grants(app)).some((g) => g.callerId === callerId)).toBe(
        false,
      );

      const badStatus = await request(app)
        .get("/authority-grants/changes?status=DONE")
        .set("Authorization", `Bearer ${CHECKER_KEY}`);
      expect(badStatus.status).toBe(400);
    });
  });
});
