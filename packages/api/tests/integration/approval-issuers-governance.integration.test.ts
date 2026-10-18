import { generateKeyPairSync } from "node:crypto";
import type { KeyObject } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuthorityType, type BusinessTransaction } from "@parmana/shared";
import type { PolicyChangeStepUpAuthorization } from "@parmana/shared";
import {
  ApprovalArtifactSigner,
  PolicyChangeStepUpAuthorizationSigner,
} from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import {
  MockPaytmConnectorServer,
  PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
} from "@parmana/connector-paytm";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createExecutionSystem } from "../../src/bootstrap/createExecutionSystem.js";
import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";
import { PolicyChangeStepUpVerifier } from "../../src/auth/PolicyChangeStepUpVerifier.js";

import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

/**
 * Approvers managed without a deploy: human callers only, maker is not
 * checker, step up on approve and reject, and an approved change takes
 * effect on the next approval checked by POST /execute.
 */
describe("Approver changes (HTTP boundary)", () => {
  const MAKER_KEY = "issuers-human-maker-raw-key-for-tests-only";
  const CHECKER_KEY = "issuers-human-checker-raw-key-for-tests-only";
  const SERVICE_KEY = "issuers-service-caller-raw-key-for-tests-only";

  const checkerStepUp = generateKeyPairSync("ed25519");
  const stepUpSigner = new PolicyChangeStepUpAuthorizationSigner();

  function signStepUp(
    changeId: string,
    action: "approve" | "reject",
    privateKey: KeyObject = checkerStepUp.privateKey,
  ): Promise<PolicyChangeStepUpAuthorization> {
    return stepUpSigner.sign(
      { pendingPolicyChangeId: changeId, action },
      privateKey,
      "checker-step-up-key",
      120,
    );
  }

  function governanceApp() {
    const { executionSystem } = createInspectableExecutionSystem();

    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "issuers-maker",
        keyHash: hashApiKey(MAKER_KEY),
        credentialHolderType: AuthorityType.USER,
      },
      {
        callerId: "issuers-checker",
        keyHash: hashApiKey(CHECKER_KEY),
        credentialHolderType: AuthorityType.USER,
        stepUpPublicKey: checkerStepUp.publicKey
          .export({ format: "pem", type: "spki" })
          .toString(),
      },
      {
        callerId: "issuers-service",
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

  function publicPem(key: KeyObject): string {
    return key.export({ format: "pem", type: "spki" }).toString();
  }

  let sequence = 0;

  function uniqueApprover(): string {
    sequence += 1;
    return `manager-test-${Date.now()}-${sequence}`;
  }

  async function propose(
    app: ReturnType<typeof governanceApp>,
    body: Record<string, unknown>,
    key = MAKER_KEY,
  ) {
    return request(app)
      .post("/approval-issuers/changes")
      .set("Authorization", `Bearer ${key}`)
      .send({ reason: "Test.", ...body });
  }

  async function approve(app: ReturnType<typeof governanceApp>, id: string) {
    return request(app)
      .post(`/approval-issuers/changes/${id}/approve`)
      .set("Authorization", `Bearer ${CHECKER_KEY}`)
      .send({ stepUpAuthorization: await signStepUp(id, "approve") });
  }

  describe("who may propose, approve and reject", () => {
    it("refuses a caller with no credential, and a service credential", async () => {
      const app = governanceApp();

      expect((await request(app).get("/approval-issuers")).status).toBe(401);

      const service = await propose(
        app,
        {
          action: "add",
          approverId: uniqueApprover(),
          keyId: "k1",
          publicKeyPem: publicPem(generateKeyPairSync("ed25519").publicKey),
        },
        SERVICE_KEY,
      );
      expect(service.status).toBe(403);
    });

    it("refuses the proposer as checker", async () => {
      const app = governanceApp();
      const proposed = await propose(app, {
        action: "add",
        approverId: uniqueApprover(),
        keyId: "k1",
        publicKeyPem: publicPem(generateKeyPairSync("ed25519").publicKey),
      });

      const response = await request(app)
        .post(`/approval-issuers/changes/${proposed.body.changeId}/approve`)
        .set("Authorization", `Bearer ${MAKER_KEY}`)
        .send({
          stepUpAuthorization: await signStepUp(
            proposed.body.changeId,
            "approve",
          ),
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE");
    });

    it("refuses an approval with no step up, a step up for another change, or for the other action", async () => {
      const app = governanceApp();
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const first = await propose(app, {
        action: "add",
        approverId: uniqueApprover(),
        keyId: "k1",
        publicKeyPem: publicPem(generateKeyPairSync("ed25519").publicKey),
      });
      const second = await propose(app, {
        action: "add",
        approverId: uniqueApprover(),
        keyId: "k1",
        publicKeyPem: publicPem(generateKeyPairSync("ed25519").publicKey),
      });
      const url = `/approval-issuers/changes/${first.body.changeId}/approve`;

      const none = await request(app)
        .post(url)
        .set("Authorization", `Bearer ${CHECKER_KEY}`)
        .send({});
      const otherChange = await request(app)
        .post(url)
        .set("Authorization", `Bearer ${CHECKER_KEY}`)
        .send({
          stepUpAuthorization: await signStepUp(
            second.body.changeId,
            "approve",
          ),
        });
      const otherAction = await request(app)
        .post(url)
        .set("Authorization", `Bearer ${CHECKER_KEY}`)
        .send({
          stepUpAuthorization: await signStepUp(first.body.changeId, "reject"),
        });

      for (const response of [none, otherChange, otherAction]) {
        expect(response.status).toBe(403);
        expect(response.body.code).toBe("STEP_UP_AUTHORIZATION_INVALID");
      }
      errors.mockRestore();

      const changes = await request(app)
        .get("/approval-issuers/changes?status=PENDING_APPROVAL")
        .set("Authorization", `Bearer ${CHECKER_KEY}`);
      expect(
        changes.body.changes.map((c: { changeId: string }) => c.changeId),
      ).toContain(first.body.changeId);
    });
  });

  describe("what may be proposed", () => {
    it("refuses a key that is not Ed25519, bad ids, and a missing reason", async () => {
      const app = governanceApp();
      const approverId = uniqueApprover();

      const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
      const cases = [
        {
          action: "add",
          approverId,
          keyId: "k1",
          publicKeyPem: publicPem(rsa.publicKey),
        },
        { action: "add", approverId, keyId: "k1", publicKeyPem: "not a key" },
        { action: "add", approverId: "bad id", keyId: "k1" },
        { action: "grant", approverId, keyId: "k1" },
        { action: "add", approverId, keyId: "k1", reason: " " },
      ];

      for (const body of cases) {
        expect((await propose(app, body)).status).toBe(400);
      }
    });

    it("refuses an approver key listed in code", async () => {
      const app = governanceApp();

      const response = await propose(app, {
        action: "add",
        approverId: "manager-charak1987",
        keyId: "manager-charak1987-key-1",
        publicKeyPem: publicPem(generateKeyPairSync("ed25519").publicKey),
      });

      expect(response.status).toBe(409);
    });

    it("refuses a second pending change for the same key, and revoking an unknown key", async () => {
      const app = governanceApp();
      const approverId = uniqueApprover();
      const add = {
        action: "add",
        approverId,
        keyId: "k1",
        publicKeyPem: publicPem(generateKeyPairSync("ed25519").publicKey),
      };

      expect((await propose(app, add)).status).toBe(201);
      expect((await propose(app, add)).status).toBe(409);
      expect(
        (
          await propose(app, {
            action: "revoke",
            approverId: uniqueApprover(),
            keyId: "k1",
          })
        ).status,
      ).toBe(409);
    });
  });

  describe("reject", () => {
    it("needs a reason, resolves the change, and adds nothing", async () => {
      const app = governanceApp();
      const approverId = uniqueApprover();
      const proposed = await propose(app, {
        action: "add",
        approverId,
        keyId: "k1",
        publicKeyPem: publicPem(generateKeyPairSync("ed25519").publicKey),
      });
      const id = proposed.body.changeId;

      const noReason = await request(app)
        .post(`/approval-issuers/changes/${id}/reject`)
        .set("Authorization", `Bearer ${CHECKER_KEY}`)
        .send({ stepUpAuthorization: await signStepUp(id, "reject") });
      expect(noReason.status).toBe(400);

      const rejected = await request(app)
        .post(`/approval-issuers/changes/${id}/reject`)
        .set("Authorization", `Bearer ${CHECKER_KEY}`)
        .send({
          rejectionReason: "Not this person.",
          stepUpAuthorization: await signStepUp(id, "reject"),
        });
      expect(rejected.status).toBe(200);
      expect(rejected.body).toMatchObject({
        status: "REJECTED",
        resolvedBy: "issuers-checker",
        rejectionReason: "Not this person.",
      });

      const issuers = await request(app)
        .get("/approval-issuers")
        .set("Authorization", `Bearer ${CHECKER_KEY}`);
      expect(
        issuers.body.issuers.some(
          (i: { approverId: string }) => i.approverId === approverId,
        ),
      ).toBe(false);

      // A resolved change cannot be approved afterwards.
      expect((await approve(app, id)).status).toBe(409);
    });
  });

  describe("an approved key signs approvals POST /execute accepts, until revoked", () => {
    let paytm: MockPaytmConnectorServer;
    const saved = {
      url: process.env.PAYTM_CONNECTOR_URL,
      secret: process.env.TEST_PAYTM_CONNECTOR_SHARED_SECRET,
    };

    beforeAll(async () => {
      paytm = new MockPaytmConnectorServer({
        sharedSecret: PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
      });
      await paytm.listen();
      process.env.PAYTM_CONNECTOR_URL = paytm.baseUrl;
      process.env.TEST_PAYTM_CONNECTOR_SHARED_SECRET =
        PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET;
    });

    afterAll(async () => {
      await paytm.close();
      if (saved.url === undefined) delete process.env.PAYTM_CONNECTOR_URL;
      else process.env.PAYTM_CONNECTOR_URL = saved.url;
      if (saved.secret === undefined)
        delete process.env.TEST_PAYTM_CONNECTOR_SHARED_SECRET;
      else process.env.TEST_PAYTM_CONNECTOR_SHARED_SECRET = saved.secret;
    });

    function refund(orderId: string, approval: unknown): BusinessTransaction {
      const businessTransactionId = crypto.randomUUID();
      const authorityId = crypto.randomUUID();
      const authorizationId = crypto.randomUUID();

      return {
        businessTransactionId,
        metadata: {
          businessTransactionId,
          correlationId: crypto.randomUUID(),
          createdBy: "integration-test",
          createdAt: new Date(),
        },
        authority: {
          authorityId,
          authorityType: "USER",
          principalId: "integration-test",
          displayName: "Integration Test",
          issuedAt: new Date(),
        },
        authorization: {
          authorizationId,
          authorityId,
          purpose: "Integration Test",
          authorizedAt: new Date(),
        },
        intent: {
          intentId: crypto.randomUUID(),
          authorizationId,
          action: "paytm:refund",
          target: `paytm://orders/${orderId}`,
          parameters: Object.freeze({
            orderId,
            transactionId: `txn-${orderId}`,
            amount: 500,
          }),
          createdAt: new Date(),
        },
        policy: {
          name: "customer-refund",
          version: "1.2.0",
          schemaVersion: "1.0.0",
        },
        signals: {
          refundEligible: true,
          fraudCheckPassed: true,
          refundAmount: 500,
          managerApproved: true,
          approvalArtifact: approval,
        },
        decision: { outcome: "APPROVED" },
        status: "APPROVED",
        createdAt: new Date(),
      } as unknown as BusinessTransaction;
    }

    it("adds, authorizes, revokes, refuses", async () => {
      const governance = governanceApp();
      const execute = createApp(
        createApplication(await createExecutionSystem()),
        { callerAuth: "disabled" },
      );

      const approverId = uniqueApprover();
      const keyId = `${approverId}-key-1`;
      const approverKeys = generateKeyPairSync("ed25519");

      async function signedApproval(orderId: string) {
        const approval = await new ApprovalArtifactSigner().sign(
          {
            approverId,
            keyId,
            capability: "paytm:refund",
            resourceId: orderId,
            scope: { field: "value", comparator: "lte", value: 500 },
            ttlSeconds: 900,
          },
          approverKeys.privateKey,
        );
        return JSON.parse(JSON.stringify(approval));
      }

      // Unknown before approval.
      const before = await request(execute)
        .post("/execute")
        .send(
          refund(`${approverId}-o1`, await signedApproval(`${approverId}-o1`)),
        );
      expect(before.status).toBe(403);

      const added = await propose(governance, {
        action: "add",
        approverId,
        keyId,
        publicKeyPem: publicPem(approverKeys.publicKey),
      });
      expect(added.status).toBe(201);
      expect(added.body).toMatchObject({
        action: "add",
        status: "PENDING_APPROVAL",
        proposedBy: "issuers-maker",
      });

      // Still unknown while pending.
      const pending = await request(execute)
        .post("/execute")
        .send(
          refund(`${approverId}-o2`, await signedApproval(`${approverId}-o2`)),
        );
      expect(pending.status).toBe(403);

      const approved = await approve(governance, added.body.changeId);
      expect(approved.status).toBe(200);
      expect(approved.body).toMatchObject({
        status: "APPROVED",
        resolvedBy: "issuers-checker",
      });

      const listed = await request(governance)
        .get("/approval-issuers")
        .set("Authorization", `Bearer ${CHECKER_KEY}`);
      expect(listed.body.issuers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            approverId: "manager-charak1987",
            source: "code",
          }),
          expect.objectContaining({
            approverId,
            keyId,
            revoked: false,
            source: "governed",
            addedByChangeId: added.body.changeId,
          }),
        ]),
      );

      const authorized = await request(execute)
        .post("/execute")
        .send(
          refund(`${approverId}-o3`, await signedApproval(`${approverId}-o3`)),
        );
      expect(authorized.status).toBe(200);

      const revoke = await propose(governance, {
        action: "revoke",
        approverId,
        keyId,
      });
      expect(revoke.status).toBe(201);
      expect((await approve(governance, revoke.body.changeId)).status).toBe(
        200,
      );

      const refused = await request(execute)
        .post("/execute")
        .send(
          refund(`${approverId}-o4`, await signedApproval(`${approverId}-o4`)),
        );
      expect(refused.status).toBe(403);

      // A revoked key id cannot be added again.
      expect(
        (
          await propose(governance, {
            action: "add",
            approverId,
            keyId,
            publicKeyPem: publicPem(generateKeyPairSync("ed25519").publicKey),
          })
        ).status,
      ).toBe(409);
    });
  });
});
