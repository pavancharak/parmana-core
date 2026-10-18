import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";

import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";

import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

/**
 * HTTP-level proof of caller authentication: the layer in
 * front of every route except /health, entirely separate
 * from policy evaluation (SignedExecutionAuthorization) and
 * gateway attestation, both of which run later and are
 * proven unchanged by this file.
 */
describe("Caller authentication (HTTP boundary)", () => {
  const CALLER_A_KEY = "caller-a-raw-key-for-tests-only";
  const CALLER_B_KEY = "caller-b-raw-key-for-tests-only";

  function buildApp() {
    const { executionSystem, auditSink: executionAuditSink } =
      createInspectableExecutionSystem();

    const application = createApplication(executionSystem);

    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "caller-a",
        keyHash: hashApiKey(CALLER_A_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["test:fixture-execute"],
      },
      {
        callerId: "caller-b",
        keyHash: hashApiKey(CALLER_B_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["test:fixture-execute"],
      },
    ]);

    const callerAuditSink = new InMemoryCallerAuditSink();

    const app = createApp(application, {
      callerAuth: { authenticator, auditSink: callerAuditSink },
    });

    return { app, executionAuditSink, callerAuditSink };
  }

  describe("valid credential", () => {
    it("reaches the route handler and executes normally", async () => {
      const { app } = buildApp();
      const transaction = await createBusinessTransaction();

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send(transaction);

      expect(response.status).toBe(200);
    });
  });

  describe("missing credential", () => {
    it("is rejected 401 before any Business Transaction is constructed", async () => {
      const { app, executionAuditSink } = buildApp();
      const transaction = await createBusinessTransaction();

      const response = await request(app).post("/execute").send(transaction);

      expect(response.status).toBe(401);

      // Nothing reached the execution-control layer at all: the
      // pre-existing execution audit trail (a different, deliberately
      // separate sink from caller auth's own) recorded zero events.
      expect(executionAuditSink.events).toHaveLength(0);
    });

    it('records a caller.rejected event with reason "missing credential"', async () => {
      const { app, callerAuditSink } = buildApp();

      await request(app)
        .post("/execute")
        .send(await createBusinessTransaction());

      expect(callerAuditSink.events).toHaveLength(1);
      expect(callerAuditSink.events[0]).toMatchObject({
        type: "caller.rejected",
        reason: "missing credential",
        route: "/execute",
      });
      expect(callerAuditSink.events[0].callerId).toBeUndefined();
    });
  });

  describe("invalid credential", () => {
    it("is rejected 401 with no downstream side effects", async () => {
      const { app, executionAuditSink } = buildApp();

      const response = await request(app)
        .post("/execute")
        .set("Authorization", "Bearer not-a-real-key")
        .send(await createBusinessTransaction());

      expect(response.status).toBe(401);
      expect(executionAuditSink.events).toHaveLength(0);
    });

    it('records a caller.rejected event with reason "invalid credential"', async () => {
      const { app, callerAuditSink } = buildApp();

      await request(app)
        .post("/execute")
        .set("Authorization", "Bearer not-a-real-key")
        .send(await createBusinessTransaction());

      expect(callerAuditSink.events).toHaveLength(1);
      expect(callerAuditSink.events[0]).toMatchObject({
        type: "caller.rejected",
        reason: "invalid credential",
      });
    });
  });

  describe("scoping and revocation", () => {
    it("a key valid for one caller does not grant a different caller's identity", async () => {
      const { app, callerAuditSink } = buildApp();

      await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send(await createBusinessTransaction());

      const authenticatedEvent = callerAuditSink.events.find(
        (event) => event.type === "caller.authenticated",
      );

      expect(authenticatedEvent?.callerId).toBe("caller-a");
      expect(authenticatedEvent?.callerId).not.toBe("caller-b");
    });

    it("a revoked key is rejected once its entry is removed from configuration", async () => {
      const oldKey = "orchestrator-old-key";
      const newKey = "orchestrator-new-key";

      const { executionSystem } = createInspectableExecutionSystem();
      const application = createApplication(executionSystem);

      // Rotation in progress: both keys active.
      const duringRotation = new StaticKeyAuthenticator([
        {
          callerId: "orchestrator-1",
          keyHash: hashApiKey(oldKey),
          allowedPrincipalIds: ["integration-test"],
          allowedCapabilities: ["test:fixture-execute"],
        },
        {
          callerId: "orchestrator-1",
          keyHash: hashApiKey(newKey),
          allowedPrincipalIds: ["integration-test"],
          allowedCapabilities: ["test:fixture-execute"],
        },
      ]);

      const appDuringRotation = createApp(application, {
        callerAuth: {
          authenticator: duringRotation,
          auditSink: new InMemoryCallerAuditSink(),
        },
      });

      const stillWorks = await request(appDuringRotation)
        .post("/execute")
        .set("Authorization", `Bearer ${oldKey}`)
        .send(await createBusinessTransaction());

      expect(stillWorks.status).toBe(200);

      // Rotation complete: the old entry is removed (revoked), matching
      // what a config reload after "add-new, migrate, revoke-old" does.
      const afterRevocation = new StaticKeyAuthenticator([
        {
          callerId: "orchestrator-1",
          keyHash: hashApiKey(newKey),
          allowedPrincipalIds: ["integration-test"],
          allowedCapabilities: ["test:fixture-execute"],
        },
      ]);

      const appAfterRevocation = createApp(application, {
        callerAuth: {
          authenticator: afterRevocation,
          auditSink: new InMemoryCallerAuditSink(),
        },
      });

      const revokedKeyRejected = await request(appAfterRevocation)
        .post("/execute")
        .set("Authorization", `Bearer ${oldKey}`)
        .send(await createBusinessTransaction());

      expect(revokedKeyRejected.status).toBe(401);

      const newKeyStillWorks = await request(appAfterRevocation)
        .post("/execute")
        .set("Authorization", `Bearer ${newKey}`)
        .send(await createBusinessTransaction());

      expect(newKeyStillWorks.status).toBe(200);
    });
  });

  describe("audit trail content", () => {
    it("records caller identity and timestamp for every outcome, never the raw key", async () => {
      const { app, callerAuditSink } = buildApp();

      await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send(await createBusinessTransaction());

      await request(app)
        .post("/execute")
        .send(await createBusinessTransaction());

      // caller.authenticated + caller.capability_granted for the
      // successful call, caller.rejected for the unauthenticated one.
      expect(callerAuditSink.events).toHaveLength(3);

      for (const event of callerAuditSink.events) {
        expect(event.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }

      const serialized = JSON.stringify(callerAuditSink.events);
      expect(serialized).not.toContain(CALLER_A_KEY);
      expect(serialized).not.toContain(CALLER_B_KEY);
    });
  });

  describe("POST /transactions parity with POST /execute (NF-004)", () => {
    it("sets metadata.grantedCapability and records caller.capability_granted, same as /execute", async () => {
      const { app, callerAuditSink } = buildApp();

      const executeResponse = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send(await createBusinessTransaction());

      expect(executeResponse.status).toBe(200);
      expect(executeResponse.body.authorization.payload.grantedCapability).toBe(
        "test:fixture-execute",
      );

      const transactionsResponse = await request(app)
        .post("/transactions")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send(await createBusinessTransaction());

      expect(transactionsResponse.status).toBe(201);
      expect(
        transactionsResponse.body.authorization.payload.grantedCapability,
      ).toBe("test:fixture-execute");

      const grantedEvents = callerAuditSink.events.filter(
        (event) => event.type === "caller.capability_granted",
      );
      expect(grantedEvents).toHaveLength(2);
    });
  });

  describe("principal identity binding", () => {
    it("blocks the exact live exploit: an ordinary caller cannot self-declare an unrelated authority.principalId (e.g. impersonating a CEO)", async () => {
      const { app } = buildApp();

      const spoofedTransaction = await createBusinessTransaction();
      // @ts-expect-error -- test fixture's authority is typed loosely
      // enough upstream that this direct mutation is the simplest way
      // to reproduce the live exploit: caller-a authenticates as
      // itself but claims to be acting as a completely different,
      // self-declared authority never verified against its own
      // identity.
      spoofedTransaction.authority.principalId = "ceo@victim-corp.example";

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send(spoofedTransaction);

      expect(response.status).toBe(403);
    });

    it("still allows a caller to assert a principalId it is explicitly permitted to assert", async () => {
      const { app } = buildApp();

      // createBusinessTransaction()'s fixture authority.principalId is
      // "integration-test", which buildApp()'s authenticator grants to
      // both caller-a and caller-b via allowedPrincipalIds.
      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send(await createBusinessTransaction());

      expect(response.status).toBe(200);
    });
  });

  describe("composition with policy evaluation", () => {
    it("a well-authenticated caller submitting a policy-rejected transaction is still rejected by policy", async () => {
      const { app } = buildApp();

      const rejectedTransaction = await createBusinessTransaction();
      // @ts-expect-error -- test fixture's signals are typed loosely enough
      // upstream that this direct mutation is the simplest way to force the
      // real policy engine (policies/vendor-payment/2.0.0/policy.json,
      // rule "reject-insufficient-funds") to reject.
      rejectedTransaction.signals.sufficientFunds = false;

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send(rejectedTransaction);

      // Caller authentication passed (no 401); policy evaluation still
      // independently rejected the transaction. Caller auth cannot
      // substitute for, or override, policy evaluation. A policy denial
      // is a deliberate, correct rejection — 403, not the generic 500 an
      // earlier version of this test asserted before that gap was fixed.
      expect(response.status).not.toBe(401);
      expect(response.status).toBe(403);
      expect(response.body.error).toContain("rejected");
      expect(response.body.code).toBe("POLICY_DENIED");
    });
  });

  describe("gateway attestation stays a separate, caller-independent layer", () => {
    it("two different authenticated callers both execute successfully with no callerId leaking into execution evidence", async () => {
      const { app, executionAuditSink } = buildApp();

      const responseA = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send(await createBusinessTransaction());

      const responseB = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_B_KEY}`)
        .send(await createBusinessTransaction());

      expect(responseA.status).toBe(200);
      expect(responseB.status).toBe(200);

      // The execution audit trail (execution-control's own, pre-existing
      // ExecutionAuditSink) has no callerId field in its event shape at
      // all, and this proves it stays that way in practice: neither
      // caller's identity appears anywhere in it.
      const serialized = JSON.stringify(executionAuditSink.events);
      expect(serialized).not.toContain("caller-a");
      expect(serialized).not.toContain("caller-b");
    });
  });

  describe("route inventory", () => {
    it("GET /health requires no credential", async () => {
      const { app } = buildApp();

      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
    });

    it("GET /ready requires no credential", async () => {
      const { app } = buildApp();

      const response = await request(app).get("/ready");

      expect(response.status).toBe(200);
    });

    it.each([
      "/",
      "/version",
      "/policies",
      "/transactions",
      "/trust-records",
      "/replay",
      "/receipt",
      "/receipt/latest",
      "/verify",
      "/verification",
      "/callers/me",
    ])("%s requires a credential", async (route) => {
      const { app } = buildApp();

      const response = await request(app).get(route);

      expect(response.status).toBe(401);
    });

    it("POST /execute requires a credential", async () => {
      const { app } = buildApp();

      const response = await request(app).post("/execute").send({});

      expect(response.status).toBe(401);
    });
  });
});
