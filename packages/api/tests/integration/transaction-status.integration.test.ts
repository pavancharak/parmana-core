import { randomUUID } from "node:crypto";

import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import { AuthorityType } from "@parmana/shared";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";

import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";

import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";
import { seedPolicyGovernanceApprovals } from "../../../../test-support/policy-governance.js";
import { transactionStatusEventRepository } from "../../src/repositories.js";

/**
 * Decision D23 over HTTP: declare (POST /transactions), execute
 * (POST /transactions/:id/execute), the status read, and reconciliation.
 * Runs against the in-memory storage, so no database is needed.
 */
describe("Transaction status (D23) over HTTP", () => {
  const CALLER_A_KEY = "status-caller-a-raw-key-for-tests-only";
  const CALLER_B_KEY = "status-caller-b-raw-key-for-tests-only";
  const OPERATOR_KEY = "status-operator-raw-key-for-tests-only";

  function buildApp() {
    const { executionSystem } = createInspectableExecutionSystem();

    const application = createApplication(executionSystem);

    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "status-caller-a",
        keyHash: hashApiKey(CALLER_A_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["test:fixture-execute"],
      },
      {
        callerId: "status-caller-b",
        keyHash: hashApiKey(CALLER_B_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["test:fixture-execute"],
      },
      {
        callerId: "status-operator",
        keyHash: hashApiKey(OPERATOR_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["test:fixture-execute"],
        credentialHolderType: AuthorityType.USER,
      },
    ]);

    const app = createApp(application, {
      callerAuth: {
        authenticator,
        auditSink: new InMemoryCallerAuditSink(),
      },
    });

    return { app };
  }

  beforeAll(async () => {
    await seedPolicyGovernanceApprovals();
  });

  async function declare(
    app: ReturnType<typeof buildApp>["app"],
    key = CALLER_A_KEY,
  ) {
    return request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${key}`)
      .send(await createBusinessTransaction());
  }

  describe("POST /transactions (declare)", () => {
    it("accepts and records RECEIVED, without releasing anything", async () => {
      const { app } = buildApp();

      const response = await declare(app);

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("RECEIVED");
      expect(response.body.businessTransactionId).toBeTypeOf("string");
      expect(response.body.acceptedAt).toBeTypeOf("string");
      // Declare returns the accepted record, not a trust record.
      expect(response.body.authorization).toBeUndefined();

      const id = response.body.businessTransactionId;
      const status = await request(app)
        .get(`/transactions/${id}/status`)
        .set("Authorization", `Bearer ${CALLER_A_KEY}`);

      expect(status.status).toBe(200);
      expect(status.body.current.status).toBe("RECEIVED");
      expect(status.body.current.stage).toBe("declare");
      expect(status.body.history).toBeUndefined();
    });
  });

  describe("POST /transactions/:id/execute", () => {
    it("releases a declared transaction and walks the status to VERIFIED", async () => {
      const { app } = buildApp();
      const declared = await declare(app);
      const id = declared.body.businessTransactionId;

      const executed = await request(app)
        .post(`/transactions/${id}/execute`)
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send();

      expect(executed.status).toBe(200);
      expect(executed.body.authorization).toBeDefined();

      const status = await request(app)
        .get(`/transactions/${id}/status?history=true`)
        .set("Authorization", `Bearer ${CALLER_A_KEY}`);

      expect(status.status).toBe(200);
      expect(status.body.current.status).toBe("VERIFIED");
      expect(
        status.body.history.map((e: { status: string }) => e.status),
      ).toEqual([
        "RECEIVED",
        "POLICY_EVALUATED",
        "APPROVED",
        "EXECUTING",
        "EXECUTED",
        "VERIFIED",
      ]);
      expect(
        status.body.history.map((e: { sequence: number }) => e.sequence),
      ).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("refuses a second execute of a VERIFIED transaction with 409 and does not release again", async () => {
      const { app } = buildApp();
      const declared = await declare(app);
      const id = declared.body.businessTransactionId;

      await request(app)
        .post(`/transactions/${id}/execute`)
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send();

      const again = await request(app)
        .post(`/transactions/${id}/execute`)
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send();

      expect(again.status).toBe(409);
      expect(again.body.code).toBe("INVALID_STATUS_TRANSITION");
      expect(again.body.error).toMatch(/status is VERIFIED/);

      const status = await request(app)
        .get(`/transactions/${id}/status?history=true`)
        .set("Authorization", `Bearer ${CALLER_A_KEY}`);
      expect(status.body.history).toHaveLength(6);
    });

    it("returns 404 for a transaction another caller declared", async () => {
      const { app } = buildApp();
      const declared = await declare(app);
      const id = declared.body.businessTransactionId;

      const response = await request(app)
        .post(`/transactions/${id}/execute`)
        .set("Authorization", `Bearer ${CALLER_B_KEY}`)
        .send();

      expect(response.status).toBe(404);
    });

    it("returns 404 for an unknown transaction", async () => {
      const { app } = buildApp();

      const response = await request(app)
        .post("/transactions/00000000-0000-4000-8000-000000000000/execute")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send();

      expect(response.status).toBe(404);
    });
  });

  describe("GET /transactions/:id/status", () => {
    it("returns 404 for another caller's transaction", async () => {
      const { app } = buildApp();
      const declared = await declare(app);

      const response = await request(app)
        .get(`/transactions/${declared.body.businessTransactionId}/status`)
        .set("Authorization", `Bearer ${CALLER_B_KEY}`);

      expect(response.status).toBe(404);
    });
  });

  describe("a transaction left in EXECUTING (outcome pending)", () => {
    async function setExecuting(id: string) {
      const repo = transactionStatusEventRepository;
      const steps = [
        ["RECEIVED", "RECEIVED", "declare"],
        ["POLICY_EVALUATED", "RECEIVED", "decide"],
        ["APPROVED", "POLICY_EVALUATED", "decide"],
        ["EXECUTING", "APPROVED", "execute"],
      ] as const;
      // The chain is recorded in order; each step's `from` is the status before it.
      for (const [to, from, stage] of steps.slice(1)) {
        await repo.append({
          eventId: randomUUID(),
          businessTransactionId: id,
          from,
          to,
          stage,
          occurredAt: new Date(),
        });
      }
    }

    it("refuses a plain execute with 409 outcome pending, and never releases", async () => {
      const { app } = buildApp();
      const declared = await declare(app);
      const id = declared.body.businessTransactionId;
      await setExecuting(id);

      const response = await request(app)
        .post(`/transactions/${id}/execute`)
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send();

      expect(response.status).toBe(409);
      expect(response.body.error).toMatch(/outcome pending/);
    });

    it("refuses reconciliation with 409 outcome unknown when no release is recorded", async () => {
      const { app } = buildApp();
      const declared = await declare(app);
      const id = declared.body.businessTransactionId;
      await setExecuting(id);

      const response = await request(app)
        .post(`/transactions/${id}/reconcile`)
        .set("Authorization", `Bearer ${OPERATOR_KEY}`)
        .send();

      expect(response.status).toBe(409);
      expect(response.body.error).toMatch(/outcome unknown/);

      const status = await request(app)
        .get(`/transactions/${id}/status`)
        .set("Authorization", `Bearer ${CALLER_A_KEY}`);
      expect(status.body.current.status).toBe("EXECUTING");
    });
  });

  describe("POST /transactions/:id/reconcile", () => {
    it("refuses a caller without a human credential", async () => {
      const { app } = buildApp();
      const declared = await declare(app);

      const response = await request(app)
        .post(`/transactions/${declared.body.businessTransactionId}/reconcile`)
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send();

      expect(response.status).toBe(403);
    });
  });
});

describe("Transaction status (D23): tenant on execute, and two executes at once", () => {
  const IN_KEY = "tenant-in-raw-key-for-tests-only";
  const OUT_KEY = "tenant-out-raw-key-for-tests-only";

  function buildTenantApp() {
    const { executionSystem } = createInspectableExecutionSystem();
    const application = createApplication(executionSystem);
    // Two keys of one caller: the key changed its tenant list after the declare.
    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "tenant-caller",
        keyHash: hashApiKey(IN_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["test:fixture-execute"],
        allowedTenantIds: ["acme"],
      },
      {
        callerId: "tenant-caller",
        keyHash: hashApiKey(OUT_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["test:fixture-execute"],
        allowedTenantIds: [],
      },
    ]);
    return createApp(application, {
      callerAuth: { authenticator, auditSink: new InMemoryCallerAuditSink() },
    });
  }

  it("refuses execute with 403 TENANT_NOT_ALLOWED when the key no longer lists the tenant", async () => {
    const app = buildTenantApp();
    const transaction = await createBusinessTransaction();
    const declared = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${IN_KEY}`)
      .send({
        ...transaction,
        metadata: { ...transaction.metadata, tenantId: "acme" },
      });
    expect(declared.status).toBe(201);

    const response = await request(app)
      .post(`/transactions/${declared.body.businessTransactionId}/execute`)
      .set("Authorization", `Bearer ${OUT_KEY}`)
      .send();

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("TENANT_NOT_ALLOWED");
  });

  it("serialises two executes of one transaction: one is released, the other is refused with 409", async () => {
    const app = buildTenantApp();
    const declared = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${IN_KEY}`)
      .send(await createBusinessTransaction());
    expect(declared.status).toBe(201);
    const id = declared.body.businessTransactionId;

    const [a, b] = await Promise.all([
      request(app)
        .post(`/transactions/${id}/execute`)
        .set("Authorization", `Bearer ${IN_KEY}`)
        .send(),
      request(app)
        .post(`/transactions/${id}/execute`)
        .set("Authorization", `Bearer ${IN_KEY}`)
        .send(),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const refused = a.status === 409 ? a : b;
    expect(refused.body.code).toBe("INVALID_STATUS_TRANSITION");
  }, 20000);
});
