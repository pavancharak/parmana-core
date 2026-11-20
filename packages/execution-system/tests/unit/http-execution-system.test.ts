import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpExecutionSystem } from "../../src/HttpExecutionSystem.js";

const request = {
  businessTransactionId: "tx-1",
  action: "PAY",
  target: "Vendor",
  parameters: { amount: 10 },
  authorization: {} as never,
};

const goodBody = {
  businessTransactionId: "tx-1",
  action: "PAY",
  target: "Vendor",
  parameters: { amount: 10 },
  success: true,
  executedAt: "2026-11-20T10:00:00.000Z",
  metadata: {},
};

function stubFetch(
  impl: (url: string, init: RequestInit) => Promise<Response>,
) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpExecutionSystem", () => {
  it("POSTs the request to {baseUrl}/execute and returns the result with executedAt as a Date", async () => {
    const fn = stubFetch(async () => json(goodBody));
    const system = new HttpExecutionSystem({
      baseUrl: "https://exec.example",
      headers: { "X-Test": "1" },
    });

    const result = await system.execute(request as never);

    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toBe("https://exec.example/execute");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Test": "1",
    });
    expect(init.signal).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.executedAt).toBeInstanceOf(Date);
    expect(result.executedAt.toISOString()).toBe("2026-11-20T10:00:00.000Z");
  });

  it("throws with the status for a non-2xx response", async () => {
    stubFetch(async () => json({ error: "nope" }, 503));
    const system = new HttpExecutionSystem({ baseUrl: "https://exec.example" });

    await expect(system.execute(request as never)).rejects.toThrow(
      "Execution System returned HTTP 503.",
    );
  });

  it.each([
    ["not an object", "a string"],
    ["a missing success", { ...goodBody, success: undefined }],
    ["a non-string action", { ...goodBody, action: 5 }],
    ["parameters that are an array", { ...goodBody, parameters: [] }],
    ["an unparseable executedAt", { ...goodBody, executedAt: "not a date" }],
  ])("rejects a response with %s", async (_label, body) => {
    stubFetch(async () => json(body));
    const system = new HttpExecutionSystem({ baseUrl: "https://exec.example" });

    await expect(system.execute(request as never)).rejects.toThrow(
      /Execution System response/,
    );
  });

  it("applies the timeout: a request that does not finish in time throws, and says the action may have run", async () => {
    // Like a real fetch: when the signal aborts, the request rejects with the
    // signal's reason (a TimeoutError from AbortSignal.timeout).
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );
    const system = new HttpExecutionSystem({
      baseUrl: "https://exec.example",
      timeout: 20,
    });

    const error = await system
      .execute(request as never)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(
      /did not respond within 20 ms\. The action may have run/,
    );
  });

  it("refuses a timeout that is not a positive number", () => {
    expect(
      () =>
        new HttpExecutionSystem({
          baseUrl: "https://exec.example",
          timeout: 0,
        }),
    ).toThrow("timeout must be a positive number");
    expect(
      () =>
        new HttpExecutionSystem({
          baseUrl: "https://exec.example",
          timeout: -5,
        }),
    ).toThrow("timeout must be a positive number");
  });
});
