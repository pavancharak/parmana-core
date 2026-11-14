import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";
import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";
import { seedPolicyGovernanceApprovals } from "../../../../test-support/policy-governance.js";

/**
 * Contract test for the agreed declare stage (docs/DECLARE_STAGE.md and
 * finalflowparmana Declare/Checks). Each test is one statement of the
 * agreed section. If a check is removed from the handler, a test here fails.
 */
const ALLOWED_KEY = "declare-contract-allowed-raw-key-for-tests-only";
const OTHER_KEY = "declare-contract-other-raw-key-for-tests-only";
const ACTION = "test:fixture-execute";

function buildApp() {
  const { executionSystem } = createInspectableExecutionSystem();
  const application = createApplication(executionSystem);
  const authenticator = new StaticKeyAuthenticator([
    {
      callerId: "declare-caller",
      keyHash: hashApiKey(ALLOWED_KEY),
      allowedPrincipalIds: ["declare-caller"],
      allowedCapabilities: [ACTION],
      allowedTenantIds: ["tenant-a"],
    },
    {
      callerId: "other-caller",
      keyHash: hashApiKey(OTHER_KEY),
      allowedPrincipalIds: ["someone-else"],
      allowedCapabilities: ["other:capability"],
    },
  ]);
  const callerAuditSink = new InMemoryCallerAuditSink();
  const app = createApp(application, {
    callerAuth: { authenticator, auditSink: callerAuditSink },
  });
  return { app, callerAuditSink };
}

function eventTypes(sink: InMemoryCallerAuditSink): string[] {
  return sink.events.map((event) => event.type);
}

describe("Declare stage contract (POST /transactions)", () => {
  beforeAll(async () => {
    await seedPolicyGovernanceApprovals();
  });

  it("accepts a valid request from an authenticated caller and writes caller.capability_granted", async () => {
    const { app, callerAuditSink } = buildApp();
    const transaction = await createBusinessTransaction();
    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${ALLOWED_KEY}`)
      .send({
        ...transaction,
        authority: { ...transaction.authority, principalId: "declare-caller" },
      });
    expect(response.status).toBe(201);
    expect(eventTypes(callerAuditSink)).toContain("caller.capability_granted");
  });

  it("refuses a malformed businessTransactionId with 400 and writes caller.structural_rejected", async () => {
    const { app, callerAuditSink } = buildApp();
    const transaction = await createBusinessTransaction();
    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${ALLOWED_KEY}`)
      .send({ ...transaction, businessTransactionId: "not-a-uuid" });
    expect(response.status).toBe(400);
    expect(eventTypes(callerAuditSink)).toContain("caller.structural_rejected");
  });

  it("refuses a principal the key may not assert with 403 and writes caller.principal_denied", async () => {
    const { app, callerAuditSink } = buildApp();
    const transaction = await createBusinessTransaction();
    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${OTHER_KEY}`)
      .send({
        ...transaction,
        authority: { ...transaction.authority, principalId: "declare-caller" },
      });
    expect(response.status).toBe(403);
    expect(eventTypes(callerAuditSink)).toContain("caller.principal_denied");
  });

  it("refuses a tenant the key does not list with 403 TENANT_NOT_ALLOWED and writes no audit event for it", async () => {
    const { app, callerAuditSink } = buildApp();
    const transaction = await createBusinessTransaction();
    const before = callerAuditSink.events.length;
    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${ALLOWED_KEY}`)
      .send({
        ...transaction,
        authority: { ...transaction.authority, principalId: "declare-caller" },
        metadata: { ...transaction.metadata, tenantId: "tenant-b" },
      });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("TENANT_NOT_ALLOWED");
    const newTypes = eventTypes(callerAuditSink).slice(before);
    expect(newTypes.some((type) => type.includes("tenant"))).toBe(false);
  });

  it("accepts a null tenantId as no tenant, so the tenant check does not apply", async () => {
    const { app } = buildApp();
    const transaction = await createBusinessTransaction();
    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${ALLOWED_KEY}`)
      .send({
        ...transaction,
        authority: { ...transaction.authority, principalId: "declare-caller" },
        metadata: { ...transaction.metadata, tenantId: null },
      });
    expect(response.status).toBe(201);
  });

  it("refuses an action the key may not invoke with 403 and writes caller.capability_denied", async () => {
    const { app, callerAuditSink } = buildApp();
    const transaction = await createBusinessTransaction();
    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${ALLOWED_KEY}`)
      .send({
        ...transaction,
        authority: { ...transaction.authority, principalId: "declare-caller" },
        intent: { ...transaction.intent, action: "other:capability" },
      });
    expect(response.status).toBe(403);
    expect(eventTypes(callerAuditSink)).toContain("caller.capability_denied");
  });

  it("refuses a metadata.businessTransactionId that differs from the top-level value with 400", async () => {
    const { app, callerAuditSink } = buildApp();
    const transaction = await createBusinessTransaction();
    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${ALLOWED_KEY}`)
      .send({
        ...transaction,
        authority: { ...transaction.authority, principalId: "declare-caller" },
        metadata: {
          ...transaction.metadata,
          businessTransactionId: crypto.randomUUID(),
        },
      });
    expect(response.status).toBe(400);
    expect(eventTypes(callerAuditSink)).toContain("caller.structural_rejected");
  });

  it("refuses a reused businessTransactionId with 409 and writes caller.structural_rejected", async () => {
    const { app, callerAuditSink } = buildApp();
    const transaction = await createBusinessTransaction();
    const body = {
      ...transaction,
      authority: { ...transaction.authority, principalId: "declare-caller" },
    };
    const first = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${ALLOWED_KEY}`)
      .send(body);
    expect(first.status).toBe(201);
    const second = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${ALLOWED_KEY}`)
      .send(body);
    expect(second.status).toBe(409);
    expect(eventTypes(callerAuditSink)).toContain("caller.structural_rejected");
  });

  it("checks the structure before the caller checks: a malformed ID with a wrong principal is refused with 400, not 403", async () => {
    const { app } = buildApp();
    const transaction = await createBusinessTransaction();
    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${OTHER_KEY}`)
      .send({
        ...transaction,
        businessTransactionId: "not-a-uuid",
        authority: { ...transaction.authority, principalId: "declare-caller" },
      });
    expect(response.status).toBe(400);
  });

  it("refuses a request with no credential with 401 before any declare check runs", async () => {
    const { app } = buildApp();
    const transaction = await createBusinessTransaction();
    const response = await request(app).post("/transactions").send(transaction);
    expect(response.status).toBe(401);
  });
});
