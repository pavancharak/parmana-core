import { describe, expect, it, vi } from "vitest";

import { CliFailure } from "../src/errors.js";
import {
  buildRequest,
  displayRequest,
  send,
  type HttpRuntime,
  type Target,
} from "../src/http.js";

const TARGET: Target = {
  baseUrl: "https://api.example.test",
  token: "secret-token",
  timeoutMs: 1000,
  verbose: false,
};

function runtimeWith(responses: Array<Response | Error>): {
  runtime: HttpRuntime;
  fetchMock: ReturnType<typeof vi.fn>;
  logs: string[];
  sleeps: number[];
} {
  const logs: string[] = [];
  const sleeps: number[] = [];
  const queue = [...responses];
  const fetchMock = vi.fn(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  return {
    runtime: {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      log: (line) => logs.push(line),
    },
    fetchMock,
    logs,
    sleeps,
  };
}

describe("buildRequest and displayRequest", () => {
  it("never displays the token or a signature", () => {
    const request = buildRequest(TARGET, {
      method: "POST",
      path: "/x",
      body: JSON.stringify({
        stepUpAuthorization: { signature: "abc123", payload: {} },
      }),
    });
    const shown = displayRequest(request, [TARGET.token]);
    expect(shown).toContain("Authorization: Bearer ***");
    expect(shown).not.toContain("secret-token");
    expect(shown).not.toContain("abc123");
  });
});

describe("send", () => {
  it("retries a GET on a 503 and returns the later success", async () => {
    const { runtime, fetchMock, sleeps } = runtimeWith([
      new Response("busy", { status: 503 }),
      new Response("[]", { status: 200 }),
    ]);
    const response = await send(TARGET, { method: "GET", path: "/p" }, runtime);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([250]);
  });

  it("retries a GET on a network error, then fails clearly after three attempts", async () => {
    const { runtime, fetchMock } = runtimeWith([
      new Error("ECONNRESET"),
      new Error("ECONNRESET"),
      new Error("ECONNRESET"),
    ]);
    await expect(
      send(TARGET, { method: "GET", path: "/p" }, runtime),
    ).rejects.toThrow(CliFailure);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never retries a POST, even on a 503", async () => {
    const { runtime, fetchMock } = runtimeWith([
      new Response("busy", { status: 503 }),
    ]);
    const response = await send(
      TARGET,
      { method: "POST", path: "/approve", body: "{}" },
      runtime,
    );
    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never retries a POST on a network error", async () => {
    const { runtime, fetchMock } = runtimeWith([new Error("socket hang up")]);
    await expect(
      send(TARGET, { method: "POST", path: "/approve", body: "{}" }, runtime),
    ).rejects.toThrow(CliFailure);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("logs each request and response code when verbose, without the token", async () => {
    const { runtime, logs } = runtimeWith([
      new Response("[]", { status: 200 }),
    ]);
    await send(
      { ...TARGET, verbose: true },
      { method: "GET", path: "/p" },
      runtime,
    );
    expect(logs[0]).toMatch(/^-> GET https:\/\/api\.example\.test\/p/);
    expect(logs[1]).toMatch(/^<- 200 \(\d+ ms\)$/);
    expect(logs.join("\n")).not.toContain("secret-token");
  });

  it("does not print the token in a network failure message", async () => {
    const { runtime } = runtimeWith([
      new Error("connect failed for secret-token"),
    ]);
    await expect(
      send(TARGET, { method: "GET", path: "/p" }, runtime),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("secret-token"),
      }),
    );
  });
});
