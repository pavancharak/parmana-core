/**
 * Parmana TypeScript SDK
 *
 * Configuration and ParmanaClient construction tests.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { ParmanaClient } from "../src/client/ParmanaClient.js";
import { HttpTransport } from "../src/transport/HttpTransport.js";
import { ConfigurationError } from "../src/errors/ConfigurationError.js";
import { RetryStrategy } from "../src/config/RetryPolicy.js";

describe("ParmanaClient construction", () => {
  it("throws ConfigurationError when endpoint is missing", () => {
    expect(
      () =>
        new ParmanaClient({
          endpoint: "",
          transport: new HttpTransport({ endpoint: "" }),
        }),
    ).toThrowError(ConfigurationError);
  });

  it("builds a default HttpTransport when transport is omitted", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { forEach: () => undefined },
      json: async () => ({ status: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const client = new ParmanaClient({
        endpoint: "http://localhost:3000",
        apiKey: "key-1",
        userAgent: "agent/1.0",
      });

      await client.health();

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer key-1");
      expect(headers["User-Agent"]).toBe("agent/1.0");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("applies retryPolicy through the default transport", async () => {
    const failing = {
      status: 503,
      headers: { forEach: () => undefined },
      json: async () => ({ error: { code: "X", message: "down" } }),
    };
    const ok = {
      status: 200,
      headers: { forEach: () => undefined },
      json: async () => ({ status: "ok" }),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failing)
      .mockResolvedValueOnce(failing)
      .mockResolvedValueOnce(ok);
    vi.stubGlobal("fetch", fetchMock);

    try {
      const client = new ParmanaClient({
        endpoint: "http://localhost:3000",
        retryPolicy: {
          enabled: true,
          maxAttempts: 3,
          initialDelayMs: 1,
          maxDelayMs: 2,
          strategy: RetryStrategy.FIXED,
        },
      });

      await client.health();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses a supplied transport as is", () => {
    const transport = new HttpTransport({ endpoint: "http://localhost:3000" });
    const client = new ParmanaClient({
      endpoint: "http://localhost:3000",
      transport,
    });

    expect(client.configuration.transport).toBe(transport);
  });

  it("accepts apiKey as part of configuration and exposes it via configuration", () => {
    const configuration = {
      endpoint: "http://localhost:3000",
      apiKey: "my-secret-api-key",
      transport: new HttpTransport({
        endpoint: "http://localhost:3000",
        apiKey: "my-secret-api-key",
      }),
    };

    const client = new ParmanaClient(configuration);

    expect(client.configuration.apiKey).toBe("my-secret-api-key");
    expect(client.endpoint()).toBe("http://localhost:3000");
  });
});

describe("apiKey flows end-to-end through ParmanaClient -> HttpTransport -> fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a request issued through ParmanaClient carries the configured Authorization header", async () => {
    let capturedHeaders: Record<string, string> | undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, requestInit: RequestInit) => {
        capturedHeaders = requestInit.headers as Record<string, string>;
        return {
          status: 200,
          headers: { forEach: () => {} },
          json: async () => ({ status: "UP" }),
        } as unknown as Response;
      }),
    );

    const endpoint = "http://localhost:3000";
    const apiKey = "my-secret-api-key";

    const client = new ParmanaClient({
      endpoint,
      apiKey,
      transport: new HttpTransport({ endpoint, apiKey }),
    });

    await client.health();

    expect(capturedHeaders?.Authorization).toBe(`Bearer ${apiKey}`);
  });
});
