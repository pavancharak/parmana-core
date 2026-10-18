import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { ApprovalNeededEvent } from "@parmana/runtime";

import {
  APPROVAL_WEBHOOK_SIGNATURE_HEADER,
  APPROVAL_WEBHOOK_TIMESTAMP_HEADER,
  WebhookApprovalNeededNotifier,
  createApprovalNeededNotifier,
  signApprovalWebhook,
} from "../../../src/bootstrap/createApprovalNeededNotifier.js";

const event: ApprovalNeededEvent = {
  type: "approval.needed",
  occurredAt: "2026-09-29T00:00:00.000Z",
  businessTransactionId: "btx-1",
  decisionId: "d-1",
  decisionOutcome: "APPROVED",
  action: "paytm:refund",
  target: "paytm://orders/ORD-1",
  policyId: "customer-refund",
  policyVersion: "1.2.0",
  reason: "No rule matched.",
  approvals: [{ signal: "managerApproved", resourceId: "ORD-1", value: 500 }],
};

describe("createApprovalNeededNotifier", () => {
  it("is off when neither variable is set", () => {
    expect(createApprovalNeededNotifier({})).toBeUndefined();
  });

  it("refuses half a configuration", () => {
    expect(() =>
      createApprovalNeededNotifier({
        APPROVAL_WEBHOOK_URL: "https://x.test/h",
      }),
    ).toThrow(/must be set together/);
    expect(() =>
      createApprovalNeededNotifier({ APPROVAL_WEBHOOK_SECRET: "s" }),
    ).toThrow(/must be set together/);
  });

  it("refuses a URL that does not parse", () => {
    expect(() =>
      createApprovalNeededNotifier({
        APPROVAL_WEBHOOK_URL: "not a url",
        APPROVAL_WEBHOOK_SECRET: "s",
      }),
    ).toThrow(/not a valid URL/);
  });

  it("requires https outside test and development", () => {
    const http = {
      APPROVAL_WEBHOOK_URL: "http://hooks.example.test/h",
      APPROVAL_WEBHOOK_SECRET: "s",
    };

    expect(() =>
      createApprovalNeededNotifier({ ...http, NODE_ENV: "production" }),
    ).toThrow(/https/);
    expect(
      createApprovalNeededNotifier({ ...http, NODE_ENV: "test" }),
    ).toBeDefined();
    expect(
      createApprovalNeededNotifier({
        ...http,
        APPROVAL_WEBHOOK_URL: "https://hooks.example.test/h",
        NODE_ENV: "production",
      }),
    ).toBeDefined();
  });
});

describe("WebhookApprovalNeededNotifier", () => {
  it("posts the event as JSON with a timestamped HMAC signature", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const notifier = new WebhookApprovalNeededNotifier(
      "https://hooks.example.test/h",
      "secret-1",
      fetchImpl as unknown as typeof fetch,
    );

    await notifier.notify(event);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe("https://hooks.example.test/h");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(String(init.body))).toEqual(event);

    const timestamp = init.headers[APPROVAL_WEBHOOK_TIMESTAMP_HEADER];
    expect(Math.abs(Number(timestamp) - Date.now() / 1000)).toBeLessThan(5);
    expect(init.headers[APPROVAL_WEBHOOK_SIGNATURE_HEADER]).toBe(
      signApprovalWebhook("secret-1", timestamp, String(init.body)),
    );
  });

  it("reports a non 2xx answer as a failure", async () => {
    const notifier = new WebhookApprovalNeededNotifier(
      "https://hooks.example.test/h",
      "secret-1",
      (async () =>
        new Response(null, { status: 502 })) as unknown as typeof fetch,
    );

    await expect(notifier.notify(event)).rejects.toThrow(/502/);
  });

  it("signs with HMAC SHA256 over the timestamp, a dot and the body", () => {
    const expected = createHmac("sha256", "k")
      .update('1700000000.{"a":1}')
      .digest("hex");

    expect(signApprovalWebhook("k", "1700000000", '{"a":1}')).toBe(
      `v1=${expected}`,
    );
    expect(signApprovalWebhook("k", "1700000001", '{"a":1}')).not.toBe(
      `v1=${expected}`,
    );
  });
});
