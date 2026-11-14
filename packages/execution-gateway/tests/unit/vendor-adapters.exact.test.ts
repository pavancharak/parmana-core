import { afterEach, describe, expect, it, vi } from "vitest";

import {
  brandCredentialHandle,
  connectorCapabilities,
  type ConnectorExecutionContext,
} from "@parmana/connector-sdk";

import { GatewayHttpAdapter } from "../../src/connector-execution/index.js";
import { HttpConnector } from "../../src/HttpConnector.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function stubFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
}

const contextWith = (value: unknown): ConnectorExecutionContext => ({
  credential: brandCredentialHandle({
    providerId: "static",
    credentialId: "c",
    value,
  }),
  timeoutMs: 2_000,
  requestedAt: new Date(),
});

describe("GatewayHttpAdapter, exactly", () => {
  const http = new GatewayHttpAdapter({
    connectorId: "http",
    capabilities: connectorCapabilities(["http:get", "crm:read"]),
    baseUrl: "http://127.0.0.1:9",
  });
  const call = (capability: string, credential: unknown) =>
    http.execute(
      {
        capability,
        businessTransactionId: "btx-1",
        action: capability,
        target: "items/1",
        parameters: { a: 1 },
      },
      contextWith(credential),
    );

  it("uses the verb of an http: capability, and POST for any other namespace", async () => {
    const fetchSpy = stubFetch({});
    await call("http:get", {});
    await call("crm:read", {});
    expect(fetchSpy.mock.calls[0]![1]).toMatchObject({ method: "GET" });
    expect(fetchSpy.mock.calls[0]![1]).not.toHaveProperty("body");
    expect(fetchSpy.mock.calls[1]![1]).toMatchObject({
      method: "POST",
      body: '{"a":1}',
    });
  });

  it("sends a bearer only when the credential carries a token", async () => {
    const fetchSpy = stubFetch({});
    await call("http:get", { token: "t-1" });
    await call("http:get", {});
    await call("http:get", null);
    const headers = fetchSpy.mock.calls.map(
      (args) => (args[1]!.headers as Record<string, string>).Authorization,
    );
    expect(headers).toEqual(["Bearer t-1", undefined, undefined]);
  });
});

describe("HttpConnector", () => {
  it("posts the transaction with its authorization to /execute, and refuses a non-2xx answer", async () => {
    const fetchSpy = stubFetch({ success: true });
    const connector = new HttpConnector({
      baseUrl: "http://127.0.0.1:9",
      headers: { "X-Key": "k" },
    } as never);
    const request = {
      transaction: { businessTransactionId: "btx-1", action: "a" },
      authorization: { keyId: "default" },
    } as never;

    // The connector also returns the hash of the body it sent; its value is
    // checked in http-connector-wire-hash.test.ts.
    await expect(connector.execute(request)).resolves.toEqual({
      success: true,
      wireContentHash: expect.any(String),
    });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("http://127.0.0.1:9/execute");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Key": "k" },
    });
    expect(JSON.parse(String(init!.body))).toEqual({
      businessTransactionId: "btx-1",
      action: "a",
      authorization: { keyId: "default" },
    });

    fetchSpy.mockImplementation(
      async () => new Response("{}", { status: 503 }),
    );
    await expect(connector.execute(request)).rejects.toThrow(
      "Connector returned HTTP 503.",
    );
  });
});
