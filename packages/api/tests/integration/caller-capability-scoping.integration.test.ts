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
 * HTTP-level proof that caller identity is actually *scoped*, not
 * just distinct: capability-based routing (CapabilityPolicyBinder,
 * PolicyEngine) is entirely caller-agnostic by design, so nothing
 * downstream of authentication restricted which capability an
 * authenticated caller could invoke until this check. Mirrors
 * caller-auth.integration.test.ts's "principal identity binding"
 * describe block, one layer over: allowedCapabilities instead of
 * allowedPrincipalIds, fail-closed default instead of
 * default-to-self, checked before application.execute() is ever
 * reached (i.e. before CapabilityPolicyBinder/PolicyEngine.evaluate).
 *
 * createBusinessTransaction()'s fixture intent.action is always
 * "test:fixture-execute".
 */
describe("Caller capability scoping (HTTP boundary)", () => {
  const SCOPED_KEY = "capability-scoping-scoped-caller-raw-key-for-tests-only";
  const UNSCOPED_KEY =
    "capability-scoping-unscoped-caller-raw-key-for-tests-only";
  const WILDCARD_KEY =
    "capability-scoping-wildcard-caller-raw-key-for-tests-only";
  const NO_CAPABILITIES_KEY =
    "capability-scoping-no-capabilities-caller-raw-key-for-tests-only";
  const TENANT_KEY = "capability-scoping-tenant-caller-raw-key-for-tests-only";

  function buildApp() {
    const { executionSystem, auditSink: executionAuditSink } =
      createInspectableExecutionSystem();

    const application = createApplication(executionSystem);

    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "scoped-caller",
        keyHash: hashApiKey(SCOPED_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["test:fixture-execute"],
      },
      {
        callerId: "unscoped-caller",
        keyHash: hashApiKey(UNSCOPED_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["razorpay:refund-create"],
      },
      {
        callerId: "wildcard-caller",
        keyHash: hashApiKey(WILDCARD_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["*"],
      },
      {
        callerId: "no-capabilities-caller",
        keyHash: hashApiKey(NO_CAPABILITIES_KEY),
        allowedPrincipalIds: ["integration-test"],
        // allowedCapabilities intentionally omitted.
      },
      {
        callerId: "tenant-caller",
        keyHash: hashApiKey(TENANT_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["test:fixture-execute"],
        allowedTenantIds: ["acme"],
      },
    ]);

    const callerAuditSink = new InMemoryCallerAuditSink();

    const app = createApp(application, {
      callerAuth: { authenticator, auditSink: callerAuditSink },
    });

    return { app, executionAuditSink, callerAuditSink };
  }

  describe("POST /execute", () => {
    async function transactionForTenant(tenantId: string) {
      const transaction = await createBusinessTransaction();
      return {
        ...transaction,
        metadata: { ...transaction.metadata, tenantId },
      };
    }

    it("refuses a tenantId the caller's key does not list, so it cannot pick another tenant's signing key", async () => {
      const { app } = buildApp();

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${SCOPED_KEY}`)
        .send(await transactionForTenant("acme"));

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("TENANT_NOT_ALLOWED");
    });

    it("treats a null tenantId as no tenant, as the SDKs send it", async () => {
      const { app } = buildApp();
      const transaction = await createBusinessTransaction();

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${SCOPED_KEY}`)
        .send({
          ...transaction,
          metadata: { ...transaction.metadata, tenantId: null },
        });

      expect(response.status).toBe(200);
    });

    it("allows a tenantId the caller's key lists", async () => {
      const { app } = buildApp();

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${TENANT_KEY}`)
        .send(await transactionForTenant("acme"));

      expect(response.status).toBe(200);
    });

    it("refuses a tenant-scoped key naming a different tenant", async () => {
      const { app } = buildApp();

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${TENANT_KEY}`)
        .send(await transactionForTenant("globex"));

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("TENANT_NOT_ALLOWED");
    });

    it("allows a caller explicitly scoped to the invoked capability", async () => {
      const { app } = buildApp();

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${SCOPED_KEY}`)
        .send(await createBusinessTransaction());

      expect(response.status).toBe(200);
    });

    it("blocks a caller scoped to a different capability, before policy evaluation ever runs", async () => {
      const { app, executionAuditSink } = buildApp();

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${UNSCOPED_KEY}`)
        .send(await createBusinessTransaction());

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("CAPABILITY_NOT_ALLOWED");
      expect(response.body.code).not.toBe("POLICY_DENIED");

      // Never reached execution-control at all.
      expect(executionAuditSink.events).toHaveLength(0);
    });

    it("fail-closed default: a caller with no allowedCapabilities configured is denied every capability", async () => {
      const { app } = buildApp();

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${NO_CAPABILITIES_KEY}`)
        .send(await createBusinessTransaction());

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("CAPABILITY_NOT_ALLOWED");
    });

    it('honors the explicit "*" wildcard grant', async () => {
      const { app } = buildApp();

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${WILDCARD_KEY}`)
        .send(await createBusinessTransaction());

      expect(response.status).toBe(200);
    });

    it("still denies a genuinely-scoped caller even when the transaction would otherwise fail policy too", async () => {
      const { app } = buildApp();

      const transaction = await createBusinessTransaction();
      // @ts-expect-error -- test fixture's signals are typed loosely
      // enough upstream that this direct mutation is the simplest way
      // to force the real policy engine to reject, if it were ever
      // reached.
      transaction.signals.riskScore = 999;

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${UNSCOPED_KEY}`)
        .send(transaction);

      // Proves ordering: capability denial pre-empts policy
      // evaluation entirely, it does not merely also reject.
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("CAPABILITY_NOT_ALLOWED");
    });

    it("records a caller.capability_denied audit event with the capability and callerId, never the raw key", async () => {
      const { app, callerAuditSink } = buildApp();

      await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${UNSCOPED_KEY}`)
        .send(await createBusinessTransaction());

      const denied = callerAuditSink.events.find(
        (event) => event.type === "caller.capability_denied",
      );

      expect(denied).toMatchObject({
        type: "caller.capability_denied",
        callerId: "unscoped-caller",
        capability: "test:fixture-execute",
        reason: "capability not allowed",
      });

      const serialized = JSON.stringify(callerAuditSink.events);
      expect(serialized).not.toContain(UNSCOPED_KEY);
    });

    it("does not record a caller.capability_denied event on the allowed path", async () => {
      const { app, callerAuditSink } = buildApp();

      await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${SCOPED_KEY}`)
        .send(await createBusinessTransaction());

      expect(
        callerAuditSink.events.some(
          (event) => event.type === "caller.capability_denied",
        ),
      ).toBe(false);
    });
  });

  describe("POST /transactions", () => {
    it("allows a caller explicitly scoped to the invoked capability", async () => {
      const { app } = buildApp();

      const response = await request(app)
        .post("/transactions")
        .set("Authorization", `Bearer ${SCOPED_KEY}`)
        .send(await createBusinessTransaction());

      expect(response.status).toBe(201);
    });

    it("blocks a caller scoped to a different capability", async () => {
      const { app } = buildApp();

      const response = await request(app)
        .post("/transactions")
        .set("Authorization", `Bearer ${UNSCOPED_KEY}`)
        .send(await createBusinessTransaction());

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("CAPABILITY_NOT_ALLOWED");
    });

    it("refuses a tenantId the caller's key does not list, so it cannot pick another tenant's signing key", async () => {
      const { app } = buildApp();
      const transaction = await createBusinessTransaction();

      const response = await request(app)
        .post("/transactions")
        .set("Authorization", `Bearer ${SCOPED_KEY}`)
        .send({
          ...transaction,
          metadata: { ...transaction.metadata, tenantId: "acme" },
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("TENANT_NOT_ALLOWED");
    });
  });
});

describe("GET /callers/me (proof artifact)", () => {
  const CALLER_A_KEY = "callers-me-caller-a-raw-key-for-tests-only";
  const CALLER_B_KEY = "callers-me-caller-b-raw-key-for-tests-only";

  function buildApp() {
    const { executionSystem } = createInspectableExecutionSystem();
    const application = createApplication(executionSystem);

    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "caller-a",
        keyHash: hashApiKey(CALLER_A_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: [
          "razorpay:refund-create",
          "razorpay:refund-fetch",
        ],
      },
      {
        callerId: "caller-b",
        keyHash: hashApiKey(CALLER_B_KEY),
        // No explicit allowedPrincipalIds/allowedCapabilities: exercises
        // the resolved-defaults path.
      },
    ]);

    return createApp(application, {
      callerAuth: { authenticator, auditSink: new InMemoryCallerAuditSink() },
    });
  }

  it("returns the caller's own identity and resolved scope, no key material", async () => {
    const app = buildApp();

    const response = await request(app)
      .get("/callers/me")
      .set("Authorization", `Bearer ${CALLER_A_KEY}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      callerId: "caller-a",
      allowedPrincipalIds: ["integration-test"],
      allowedCapabilities: ["razorpay:refund-create", "razorpay:refund-fetch"],
      unrestrictedCapabilities: false,
    });

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(CALLER_A_KEY);
    expect(serialized.toLowerCase()).not.toContain("keyhash");
  });

  it("resolves defaults: unset allowedPrincipalIds -> [callerId], unset allowedCapabilities -> []", async () => {
    const app = buildApp();

    const response = await request(app)
      .get("/callers/me")
      .set("Authorization", `Bearer ${CALLER_B_KEY}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      callerId: "caller-b",
      allowedPrincipalIds: ["caller-b"],
      allowedCapabilities: [],
      unrestrictedCapabilities: false,
    });
  });

  it("each caller sees only its own identity, never another caller's", async () => {
    const app = buildApp();

    const asCallerA = await request(app)
      .get("/callers/me")
      .set("Authorization", `Bearer ${CALLER_A_KEY}`);

    const asCallerB = await request(app)
      .get("/callers/me")
      .set("Authorization", `Bearer ${CALLER_B_KEY}`);

    expect(asCallerA.body.callerId).toBe("caller-a");
    expect(asCallerB.body.callerId).toBe("caller-b");
    expect(asCallerA.body.callerId).not.toBe(asCallerB.body.callerId);
  });

  it("requires a credential", async () => {
    const app = buildApp();

    const response = await request(app).get("/callers/me");

    expect(response.status).toBe(401);
  });
});
