import { generateKeyPairSync } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessTransaction } from "@parmana/shared";
import { StaticApprovalIssuerRegistry } from "@parmana/approval";
import { ApprovalArtifactSigner } from "@parmana/crypto";
import {
  MockPaytmConnectorServer,
  PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
} from "@parmana/connector-paytm";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createExecutionSystem } from "../../src/bootstrap/createExecutionSystem.js";
import {
  APPROVAL_WEBHOOK_SIGNATURE_HEADER,
  APPROVAL_WEBHOOK_TIMESTAMP_HEADER,
  signApprovalWebhook,
} from "../../src/bootstrap/createApprovalNeededNotifier.js";

/**
 * A refused request that a signed approval would authorize is sent to
 * APPROVAL_WEBHOOK_URL, signed. Any other refusal, and any success, is
 * not. A failing webhook never changes the refusal.
 */

const approver = vi.hoisted(() => ({
  approverId: "manager-priya",
  keyId: "manager-priya-key-1",
}));

const approverKeys = generateKeyPairSync("ed25519");

vi.mock("../../src/bootstrap/createApprovalIssuerRegistry.js", () => ({
  createApprovalIssuerRegistry: () =>
    new StaticApprovalIssuerRegistry([
      {
        approverId: approver.approverId,
        keyId: approver.keyId,
        publicKey: approverKeys.publicKey,
        revoked: false,
      },
    ]),
}));

const WEBHOOK_SECRET = "webhook-test-secret";

const ENV_KEYS = [
  "PAYTM_CONNECTOR_URL",
  "TEST_PAYTM_CONNECTOR_SHARED_SECRET",
  "APPROVAL_WEBHOOK_URL",
  "APPROVAL_WEBHOOK_SECRET",
] as const;

interface Received {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
}

describe("approval needed webhook (HTTP boundary)", () => {
  let paytm: MockPaytmConnectorServer;
  let webhook: Server;
  let received: Received[];
  let webhookStatus: number;
  const saved = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  beforeEach(async () => {
    received = [];
    webhookStatus = 204;

    webhook = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push({ headers: req.headers, body });
        res.statusCode = webhookStatus;
        res.end();
      });
    });
    await new Promise<void>((resolve) =>
      webhook.listen(0, "127.0.0.1", resolve),
    );

    paytm = new MockPaytmConnectorServer({
      sharedSecret: PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
    });
    await paytm.listen();

    const { port } = webhook.address() as AddressInfo;
    process.env.PAYTM_CONNECTOR_URL = paytm.baseUrl;
    process.env.TEST_PAYTM_CONNECTOR_SHARED_SECRET =
      PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET;
    process.env.APPROVAL_WEBHOOK_URL = `http://127.0.0.1:${port}/hook`;
    process.env.APPROVAL_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await paytm.close();
    await new Promise<void>((resolve) => webhook.close(() => resolve()));
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  async function buildApp() {
    const application = createApplication(await createExecutionSystem());
    return createApp(application, { callerAuth: "disabled" });
  }

  function refund(
    orderId: string,
    amount: number,
    signals: Record<string, unknown>,
  ): BusinessTransaction {
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
          amount,
        }),
        createdAt: new Date(),
      },
      policy: {
        name: "customer-refund",
        version: "1.2.0",
        schemaVersion: "1.0.0",
      },
      signals,
      decision: { outcome: "APPROVED" },
      status: "APPROVED",
      createdAt: new Date(),
    } as unknown as BusinessTransaction;
  }

  const facts = (amount: number) => ({
    refundEligible: true,
    fraudCheckPassed: true,
    refundAmount: amount,
  });

  it("sends a signed approval.needed event when only the approval is missing", async () => {
    const app = await buildApp();
    const transaction = refund("order-wait-1", 750, {
      ...facts(750),
      managerApproved: false,
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(403);
    expect(received).toHaveLength(1);

    const [{ headers, body }] = received;
    const timestamp = String(headers[APPROVAL_WEBHOOK_TIMESTAMP_HEADER]);
    expect(headers[APPROVAL_WEBHOOK_SIGNATURE_HEADER]).toBe(
      signApprovalWebhook(WEBHOOK_SECRET, timestamp, body),
    );
    expect(headers["content-type"]).toContain("application/json");

    const event = JSON.parse(body);
    expect(event).toMatchObject({
      type: "approval.needed",
      businessTransactionId: transaction.businessTransactionId,
      action: "paytm:refund",
      target: "paytm://orders/order-wait-1",
      policyId: "customer-refund",
      policyVersion: "1.2.0",
      approvals: [
        { signal: "managerApproved", resourceId: "order-wait-1", value: 750 },
      ],
    });
    expect(typeof event.decisionId).toBe("string");
    // What the approver needs, not the request's other parameters.
    expect(body).not.toContain("txn-order-wait-1");
    expect(paytm.calls).toHaveLength(0);
  });

  it("also notifies when the approval signal is true but no valid approval is attached", async () => {
    const app = await buildApp();

    const response = await request(app)
      .post("/execute")
      .send(
        refund("order-wait-2", 500, { ...facts(500), managerApproved: true }),
      );

    expect(response.status).toBe(403);
    expect(received).toHaveLength(1);
  });

  it("does not notify when an approval would not help", async () => {
    const app = await buildApp();

    const fraud = await request(app)
      .post("/execute")
      .send(
        refund("order-fraud-1", 500, {
          ...facts(500),
          fraudCheckPassed: false,
          managerApproved: false,
        }),
      );
    const aboveMaximum = await request(app)
      .post("/execute")
      .send(
        refund("order-big-1", 200000, {
          ...facts(200000),
          managerApproved: false,
        }),
      );

    expect(fraud.status).toBe(403);
    expect(aboveMaximum.status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it("does not notify an authorized request", async () => {
    const app = await buildApp();
    const approval = await new ApprovalArtifactSigner().sign(
      {
        approverId: approver.approverId,
        keyId: approver.keyId,
        capability: "paytm:refund",
        resourceId: "order-ok-1",
        scope: { field: "value", comparator: "lte", value: 500 },
        ttlSeconds: 900,
      },
      approverKeys.privateKey,
    );

    const response = await request(app)
      .post("/execute")
      .send(
        refund("order-ok-1", 500, {
          ...facts(500),
          managerApproved: true,
          approvalArtifact: JSON.parse(JSON.stringify(approval)),
        }),
      );

    expect(response.status).toBe(200);
    expect(received).toHaveLength(0);
  });

  it("keeps the refusal unchanged when the webhook fails", async () => {
    webhookStatus = 500;
    const app = await buildApp();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await request(app)
      .post("/execute")
      .send(
        refund("order-wait-3", 500, { ...facts(500), managerApproved: false }),
      );

    expect(response.status).toBe(403);
    expect(received).toHaveLength(1);
    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "approval_needed_notification_failed",
      }),
    );
  });
});
