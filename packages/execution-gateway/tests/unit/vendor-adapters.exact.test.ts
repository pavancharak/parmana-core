import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HUBSPOT_DEAL_FETCH_CAPABILITY,
  HUBSPOT_DEAL_UPDATE_CAPABILITY,
  HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN,
} from "@parmana/connector-hubspot";
import {
  brandCredentialHandle,
  connectorCapabilities,
  type ConnectorExecutionContext,
} from "@parmana/connector-sdk";

import {
  GatewayHttpAdapter,
  GatewayHubSpotAdapter,
} from "../../src/connector-execution/index.js";
import { HttpConnector } from "../../src/HttpConnector.js";

/**
 * Mutation testing found these checks in the HubSpot adapter
 * tested loosely or not at all: required fields, the refusal of "." and
 * ".." as a repository, the placeholder token guards (in both directions),
 * and HTTPS accepted in production.
 * fetch is stubbed: each check either refuses before any network call,
 * or is observed in the request sent.
 */

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

describe("GatewayHubSpotAdapter, exactly", () => {
  const hubspot = (baseUrl?: string) =>
    new GatewayHubSpotAdapter({
      connectorId: "hubspot",
      capabilities: connectorCapabilities([
        HUBSPOT_DEAL_FETCH_CAPABILITY,
        HUBSPOT_DEAL_UPDATE_CAPABILITY,
      ]),
      ...(baseUrl !== undefined ? { baseUrl } : {}),
    });
  const update = (parameters: Record<string, unknown>) => ({
    capability: HUBSPOT_DEAL_UPDATE_CAPABILITY,
    businessTransactionId: "btx-1",
    action: HUBSPOT_DEAL_UPDATE_CAPABILITY,
    target: "deal/1",
    parameters,
  });
  const real = contextWith({ privateAppToken: "pat-real-token" });

  it("sends a real token to HubSpot's API, and refuses only the placeholder there", async () => {
    const fetchSpy = stubFetch({ id: "1" });
    await hubspot().execute(update({ dealId: "1", amount: 5 }), real);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await expect(
      hubspot().execute(
        update({ dealId: "1", amount: 5 }),
        contextWith({ privateAppToken: HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN }),
      ),
    ).rejects.toThrow(/refuses to send the built-in test-mode placeholder/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("sends only the properties given", async () => {
    const fetchSpy = stubFetch({ id: "1" });
    await hubspot("http://127.0.0.1:9").execute(
      update({ dealId: "1", amount: 5 }),
      real,
    );
    expect(JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body))).toEqual({
      properties: { amount: "5" },
    });
  });

  it.each([
    [{ dealId: "1" }, /neither dealstage nor amount/],
    [{ amount: 5 }, 'missing required field "parameters.dealId"'],
    [{ dealId: "", amount: 5 }, 'missing required field "parameters.dealId"'],
    [
      { dealId: "1", dealstage: "" },
      'missing required field "parameters.dealstage"',
    ],
    [
      { dealId: "1", amount: "5" },
      '"parameters.amount" must be a finite number',
    ],
    [
      { dealId: "1", amount: Number.NaN },
      '"parameters.amount" must be a finite number',
    ],
  ])("refuses %j before any network call", async (parameters, message) => {
    const fetchSpy = stubFetch({});
    await expect(
      hubspot("http://127.0.0.1:9").execute(update(parameters), real),
    ).rejects.toThrow(message);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
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

    await expect(connector.execute(request)).resolves.toEqual({
      success: true,
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
