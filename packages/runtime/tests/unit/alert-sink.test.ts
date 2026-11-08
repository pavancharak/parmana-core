import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  DecisionAlertHook,
  MemoryAlertSink,
  WebhookAlertSink,
  assertAlertUrl,
  type AlertEvent,
} from "../../src/index.js";

const EVENT: AlertEvent = {
  type: "decision.refused",
  occurredAt: "2026-11-08T12:00:00.000Z",
  businessTransactionId: "bt-1",
  decisionId: "dec-1",
  policyName: "customer-refund",
  policyVersion: "1.3.0",
  submittedBy: "agent-7",
  reason: "amount above limit",
};

function fakeFetch(
  responses: Array<number | "network-error">,
  calls: Array<{ url: string; init: RequestInit }>,
): typeof fetch {
  let index = 0;

  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses[Math.min(index++, responses.length - 1)];

    if (next === "network-error") {
      throw new Error("socket hang up");
    }

    return new Response(null, { status: next });
  }) as typeof fetch;
}

describe("assertAlertUrl", () => {
  it.each([
    "https://alerts.example.com/hook",
    "http://localhost:4010/hook",
    "http://127.0.0.1:4010/hook",
  ])("accepts %s", (url) => {
    expect(() => assertAlertUrl(url)).not.toThrow();
  });

  it.each([
    "http://alerts.example.com/hook",
    "ftp://alerts.example.com/hook",
    "http://10.0.0.5/hook",
  ])("refuses %s", (url) => {
    expect(() => assertAlertUrl(url)).toThrow(/https/);
  });
});

describe("WebhookAlertSink", () => {
  it("posts the event with the schema marker and no Intent parameters", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const sink = new WebhookAlertSink({
      url: "https://alerts.example.com/hook",
      fetchImpl: fakeFetch([200], calls),
    });

    const result = await sink.emit(EVENT);
    const body = JSON.parse(String(calls[0]?.init.body));

    expect(result).toEqual({ delivered: true, attempts: 1 });
    expect(body).toEqual({ schema: "parmana.alert.v1", ...EVENT });
    expect(JSON.stringify(body)).not.toMatch(/parameters|signals|artifact/);
  });

  it("signs the exact body with HMAC-SHA256 when a secret is set", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const sink = new WebhookAlertSink({
      url: "https://alerts.example.com/hook",
      secret: "shared-secret",
      fetchImpl: fakeFetch([200], calls),
    });

    await sink.emit(EVENT);

    const body = String(calls[0]?.init.body);
    const headers = calls[0]?.init.headers as Record<string, string>;
    const expected = createHmac("sha256", "shared-secret")
      .update(body)
      .digest("hex");

    expect(headers["x-parmana-signature"]).toBe(`sha256=${expected}`);
  });

  it("retries a 5xx and succeeds on a later attempt", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const sink = new WebhookAlertSink({
      url: "https://alerts.example.com/hook",
      retryDelayMs: 0,
      fetchImpl: fakeFetch([503, 500, 200], calls),
    });

    const result = await sink.emit(EVENT);

    expect(result).toEqual({ delivered: true, attempts: 3 });
    expect(calls).toHaveLength(3);
  });

  it("does not retry a 4xx, because the receiver rejected the alert", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const sink = new WebhookAlertSink({
      url: "https://alerts.example.com/hook",
      retryDelayMs: 0,
      fetchImpl: fakeFetch([400], calls),
    });

    const result = await sink.emit(EVENT);

    expect(result).toEqual({
      delivered: false,
      attempts: 1,
      error: "HTTP 400",
    });
    expect(calls).toHaveLength(1);
  });

  it("never rejects, even when every attempt fails on the network", async () => {
    const sink = new WebhookAlertSink({
      url: "https://alerts.example.com/hook",
      maxAttempts: 2,
      retryDelayMs: 0,
      fetchImpl: fakeFetch(["network-error"], []),
    });

    await expect(sink.emit(EVENT)).resolves.toEqual({
      delivered: false,
      attempts: 2,
      error: "socket hang up",
    });
  });
});

describe("DecisionAlertHook", () => {
  const context = (outcome: "APPROVED" | "REJECTED") =>
    ({
      transaction: {
        businessTransactionId: "bt-9",
        metadata: { submittedBy: "agent-7" },
      },
      decision: {
        decisionId: "dec-9",
        outcome,
        reason: "ok",
        policy: { name: "customer-refund", version: "1.3.0" },
      },
    }) as never;

  it("emits decision.approved and decision.refused by outcome", async () => {
    const sink = new MemoryAlertSink();
    const hook = new DecisionAlertHook(sink);

    await hook.afterDecision(context("APPROVED"));
    await hook.afterDecision(context("REJECTED"));
    // The hook does not wait for delivery, so let the queued emits land.
    await new Promise((resolve) => setImmediate(resolve));

    expect(sink.events.map((event) => event.type)).toEqual([
      "decision.approved",
      "decision.refused",
    ]);
    expect(sink.events[0]).toMatchObject({
      businessTransactionId: "bt-9",
      policyName: "customer-refund",
      policyVersion: "1.3.0",
      submittedBy: "agent-7",
    });
  });

  it("does not wait for a stalled alert destination", async () => {
    const stalled = {
      emit: () => new Promise<never>(() => undefined),
    };
    const hook = new DecisionAlertHook(stalled);

    await expect(
      hook.afterDecision(context("REJECTED")),
    ).resolves.toBeUndefined();
  });

  it("does not fail the decision when the sink rejects", async () => {
    const broken = {
      emit: () => Promise.reject(new Error("destination down")),
    };
    const hook = new DecisionAlertHook(broken);

    await expect(
      hook.afterDecision(context("REJECTED")),
    ).resolves.toBeUndefined();
  });
});
