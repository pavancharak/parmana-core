import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessTransaction } from "@parmana/shared";
import {
  MockPaytmConnectorServer,
  PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
} from "@parmana/connector-paytm";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createExecutionSystem } from "../../src/bootstrap/createExecutionSystem.js";

/**
 * A refund refused only for want of a manager approval is emailed through
 * Resend (the SDK is replaced here, so nothing leaves the process), once
 * per refusal. A refund refused for another reason is not.
 */

const sends = vi.hoisted(
  () => [] as { payload: Record<string, unknown>; options: unknown }[],
);

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (payload: Record<string, unknown>, options: unknown) => {
        sends.push({ payload, options });
        return { data: { id: "email-1" }, error: null };
      },
    };
  },
}));

const ENV_KEYS = [
  "PAYTM_CONNECTOR_URL",
  "TEST_PAYTM_CONNECTOR_SHARED_SECRET",
  "APPROVAL_EMAIL_TO",
  "RESEND_API_KEY",
  "RESEND_EMAIL_DOMAIN",
] as const;

describe("approval needed email (HTTP boundary)", () => {
  let paytm: MockPaytmConnectorServer;
  const saved = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  beforeEach(async () => {
    sends.length = 0;
    paytm = new MockPaytmConnectorServer({
      sharedSecret: PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
    });
    await paytm.listen();
    process.env.PAYTM_CONNECTOR_URL = paytm.baseUrl;
    process.env.TEST_PAYTM_CONNECTOR_SHARED_SECRET =
      PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET;
    process.env.APPROVAL_EMAIL_TO = "manager@x.test";
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_EMAIL_DOMAIN = "notify.parmanasystems.com";
  });

  afterEach(async () => {
    await paytm.close();
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function refund(orderId: string, signals: Record<string, unknown>) {
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
          amount: 750,
        }),
        createdAt: new Date(),
      },
      policy: {
        name: "customer-refund",
        version: "1.2.0",
        schemaVersion: "1.0.0",
      },
      signals: { refundAmount: 750, ...signals },
      decision: { outcome: "APPROVED" },
      status: "APPROVED",
      createdAt: new Date(),
    } as unknown as BusinessTransaction;
  }

  async function app() {
    return createApp(createApplication(await createExecutionSystem()), {
      callerAuth: "disabled",
    });
  }

  it("emails the approver what to sign", async () => {
    const response = await request(await app())
      .post("/execute")
      .send(
        refund("ORD-MAIL-1", {
          refundEligible: true,
          fraudCheckPassed: true,
          managerApproved: false,
        }),
      );

    expect(response.status).toBe(403);
    expect(sends).toHaveLength(1);

    const [{ payload, options }] = sends;
    expect(payload).toMatchObject({
      from: "Parmana approvals <approvals@notify.parmanasystems.com>",
      to: ["manager@x.test"],
      subject: "Approval needed: paytm:refund ORD-MAIL-1 up to 750",
    });
    expect(String(payload.text)).toContain("resourceId  ORD-MAIL-1");
    expect(options).toMatchObject({
      idempotencyKey: expect.stringMatching(/^approval-needed\//),
    });
    expect(paytm.calls).toHaveLength(0);
  });

  it("sends nothing when an approval would not help", async () => {
    const response = await request(await app())
      .post("/execute")
      .send(
        refund("ORD-MAIL-2", {
          refundEligible: true,
          fraudCheckPassed: false,
          managerApproved: false,
        }),
      );

    expect(response.status).toBe(403);
    expect(sends).toHaveLength(0);
  });
});
