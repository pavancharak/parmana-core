import { describe, expect, it } from "vitest";

import {
  canonicalProbeBytes,
  classifyBypassStatus,
  runBypassProbe,
  type BypassProbeRecord,
  type BypassProbeTarget,
} from "../../../src/inbound/bypass-probe.js";

const target: BypassProbeTarget = {
  name: "billing-refund",
  url: "https://billing.example.com/refunds",
  method: "POST",
  body: '{"orderId":"probe"}',
};

function harness(responder: () => Promise<Response> | Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const logged: unknown[] = [];
  const alerts: BypassProbeRecord[] = [];
  const deps = {
    fetch: async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return responder();
    },
    sign: async (bytes: Buffer) => `sig:${bytes.length}`,
    log: { record: async (r: unknown) => void logged.push(r) },
    alert: async (r: BypassProbeRecord) => void alerts.push(r),
    newId: () => "probe-1",
    now: () => new Date("2026-11-06T12:00:00.000Z"),
  };
  return { deps, calls, logged, alerts };
}

describe("classifyBypassStatus", () => {
  it("counts 401 and 403 as refusals", () => {
    expect(classifyBypassStatus(401)).toBe("refused");
    expect(classifyBypassStatus(403)).toBe("refused");
  });
  it("counts any 2xx or 3xx as a bypass", () => {
    expect(classifyBypassStatus(200)).toBe("bypass");
    expect(classifyBypassStatus(302)).toBe("bypass");
  });
  it("counts other statuses as not verified", () => {
    expect(classifyBypassStatus(404)).toBe("not_verified");
    expect(classifyBypassStatus(500)).toBe("not_verified");
  });
});

describe("runBypassProbe", () => {
  it("records a refusal and does not alert", async () => {
    const h = harness(() => new Response("no", { status: 403 }));
    const record = await runBypassProbe(target, h.deps);
    expect(record.outcome).toBe("refused");
    expect(record.status).toBe(403);
    expect(h.logged).toHaveLength(1);
    expect(h.alerts).toHaveLength(0);
  });

  it("alerts when the route accepts the request", async () => {
    const h = harness(() => new Response("ok", { status: 200 }));
    const record = await runBypassProbe(target, h.deps);
    expect(record.outcome).toBe("bypass");
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0]?.targetName).toBe("billing-refund");
    expect(h.logged).toHaveLength(1);
  });

  it("records not_verified, without alerting, when there is no answer", async () => {
    const h = harness(() => {
      throw new TypeError("network down");
    });
    const record = await runBypassProbe(target, h.deps);
    expect(record.outcome).toBe("not_verified");
    expect(record.status).toBeUndefined();
    expect(h.alerts).toHaveLength(0);
    expect(h.logged).toHaveLength(1);
  });

  it("sends no credential, follows no redirect, and sends the target's body", async () => {
    const h = harness(() => new Response("no", { status: 401 }));
    await runBypassProbe(target, h.deps);
    const init = h.calls[0]?.init as RequestInit & {
      headers: Record<string, string>;
    };
    expect(init.redirect).toBe("error");
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.body).toBe(target.body);
    expect(h.calls[0]?.url).toBe(target.url);
  });

  it("signs the canonical record and stores the signature with it", async () => {
    const h = harness(() => new Response("no", { status: 403 }));
    const record = await runBypassProbe(target, h.deps);
    expect(record.signature).toMatch(/^sig:\d+$/);
    expect(canonicalProbeBytes(record).toString()).not.toContain("signature");
  });

  it("refuses a target that is not https", async () => {
    const h = harness(() => new Response("no", { status: 403 }));
    await expect(
      runBypassProbe({ ...target, url: "http://billing.example.com/" }, h.deps),
    ).rejects.toThrow(/https/);
    expect(h.calls).toHaveLength(0);
  });

  it("refuses a target that is not an absolute URL", async () => {
    const h = harness(() => new Response("no", { status: 403 }));
    await expect(
      runBypassProbe({ ...target, url: "billing" }, h.deps),
    ).rejects.toThrow(/absolute URL/);
  });
});
