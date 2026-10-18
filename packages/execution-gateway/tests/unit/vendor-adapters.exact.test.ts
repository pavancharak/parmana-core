import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GITHUB_PR_FETCH_CAPABILITY,
  GITHUB_PR_MERGE_CAPABILITY,
  GITHUB_TEST_MODE_PLACEHOLDER_TOKEN,
} from "@parmana/connector-github";
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
  SLACK_POST_MESSAGE_CAPABILITY,
  SLACK_TEST_MODE_PLACEHOLDER_TOKEN,
} from "@parmana/connector-slack";

import {
  GatewayGitHubAdapter,
  GatewayHttpAdapter,
  GatewayHubSpotAdapter,
  GatewaySlackAdapter,
} from "../../src/connector-execution/index.js";
import { HttpConnector } from "../../src/HttpConnector.js";

/**
 * Mutation testing found these checks in the Slack, HubSpot and GitHub
 * adapters tested loosely or not at all: required fields, the refusal of
 * "." and ".." as a repository, the placeholder token guards (in both
 * directions), Slack's answer shape, and HTTPS accepted in production.
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

describe("GatewaySlackAdapter, exactly", () => {
  const slack = (baseUrl = "http://127.0.0.1:9") =>
    new GatewaySlackAdapter({
      connectorId: "slack",
      capabilities: connectorCapabilities([SLACK_POST_MESSAGE_CAPABILITY]),
      baseUrl,
    });
  const post = (parameters: Record<string, unknown>, target = "C1") => ({
    capability: SLACK_POST_MESSAGE_CAPABILITY,
    businessTransactionId: "btx-1",
    action: SLACK_POST_MESSAGE_CAPABILITY,
    target,
    parameters,
  });
  const context = contextWith({ botToken: SLACK_TEST_MODE_PLACEHOLDER_TOKEN });

  it.each([
    ["channel", { text: "hi" }],
    ["channel", { channel: "", text: "hi" }],
    ["text", { channel: "C1" }],
    ["text", { channel: "C1", text: "" }],
  ])(
    "refuses a missing %s before any network call",
    async (field, parameters) => {
      const fetchSpy = stubFetch({ ok: true });
      await expect(slack().execute(post(parameters), context)).rejects.toThrow(
        `SlackConnector request is missing required field "parameters.${field}".`,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("refuses an answer without Slack's ok field", async () => {
    stubFetch({ channel: "C1" });
    await expect(
      slack().execute(post({ channel: "C1", text: "hi" }), context),
    ).rejects.toThrow(
      'SlackConnector "slack" received a malformed response -- missing "ok" field.',
    );
  });

  it("records the channel it posted to when Slack does not echo one", async () => {
    stubFetch({ ok: true, ts: "1.2" });
    const response = await slack().execute(
      post({ channel: "C1", text: "hi" }),
      context,
    );
    expect(response.metadata).toMatchObject({ channel: "C1", ts: "1.2" });
  });

  it("allows the placeholder token to a localhost target", async () => {
    const fetchSpy = stubFetch({ ok: true });
    await slack("http://localhost:9").execute(
      post({ channel: "C1", text: "hi" }),
      context,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("accepts an HTTPS base URL outside NODE_ENV=test", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => slack("https://slack.com/api")).not.toThrow();
    } finally {
      process.env.NODE_ENV = original;
    }
  });
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

describe("GatewayGitHubAdapter, exactly", () => {
  const github = (baseUrl?: string) =>
    new GatewayGitHubAdapter({
      connectorId: "github",
      capabilities: connectorCapabilities([
        GITHUB_PR_FETCH_CAPABILITY,
        GITHUB_PR_MERGE_CAPABILITY,
      ]),
      ...(baseUrl !== undefined ? { baseUrl } : {}),
    });
  const fetchPr = (target: string) => ({
    capability: GITHUB_PR_FETCH_CAPABILITY,
    businessTransactionId: "btx-1",
    action: GITHUB_PR_FETCH_CAPABILITY,
    target,
    parameters: {},
  });
  const merge = (parameters: Record<string, unknown>) => ({
    ...fetchPr("acme/widgets#42"),
    capability: GITHUB_PR_MERGE_CAPABILITY,
    action: GITHUB_PR_MERGE_CAPABILITY,
    parameters,
  });
  const real = contextWith({ installationToken: "ghs_real" });
  const PR = {
    number: 42,
    mergeable: true,
    merged_at: null,
    head: { sha: "abc" },
    base: { ref: "main" },
  };

  it.each([
    "acme/.#1",
    "acme/..#1",
    "acme/widgets#",
    "acme/widgets/extra#1",
    "x acme/widgets#1",
    "acme/widgets#1 ",
    "acme/wid?gets#1",
  ])("refuses the target %j before any network call", async (target) => {
    const fetchSpy = stubFetch(PR);
    await expect(
      github("http://127.0.0.1:9").execute(fetchPr(target), real),
    ).rejects.toThrow(
      `GitHubConnector received an invalid target "${target}".`,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts a repository with dots that is not . or ..", async () => {
    const fetchSpy = stubFetch(PR);
    await github("http://127.0.0.1:9").execute(fetchPr("acme/.github#7"), real);
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "http://127.0.0.1:9/repos/acme/.github/pulls/7",
    );
  });

  it("sends a real token to GitHub's API, and refuses only the placeholder there", async () => {
    const fetchSpy = stubFetch(PR);
    await github().execute(fetchPr("acme/widgets#42"), real);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await expect(
      github().execute(
        fetchPr("acme/widgets#42"),
        contextWith({ installationToken: GITHUB_TEST_MODE_PLACEHOLDER_TOKEN }),
      ),
    ).rejects.toThrow(/refuses to send the built-in test-mode placeholder/);

    // The placeholder is allowed to a mock server.
    await github("http://127.0.0.1:9").execute(
      fetchPr("acme/widgets#42"),
      contextWith({ installationToken: GITHUB_TEST_MODE_PLACEHOLDER_TOKEN }),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{}, "parameters.mergeMethod"],
    [{ mergeMethod: "" }, "parameters.mergeMethod"],
    [
      { mergeMethod: "squash", expectedHeadSha: "" },
      "parameters.expectedHeadSha",
    ],
  ])("refuses a merge with %j", async (parameters, field) => {
    const fetchSpy = stubFetch({ merged: true });
    await expect(
      github("http://127.0.0.1:9").execute(merge(parameters), real),
    ).rejects.toThrow(
      `GitHubConnector request is missing required field "${field}".`,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forwards expectedHeadSha as GitHub's sha, and only when given", async () => {
    const fetchSpy = stubFetch({ merged: true });
    await github("http://127.0.0.1:9").execute(
      merge({ mergeMethod: "squash", expectedHeadSha: "abc" }),
      real,
    );
    await github("http://127.0.0.1:9").execute(
      merge({ mergeMethod: "squash" }),
      real,
    );
    expect(JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body))).toEqual({
      merge_method: "squash",
      sha: "abc",
    });
    expect(JSON.parse(String(fetchSpy.mock.calls[1]![1]!.body))).toEqual({
      merge_method: "squash",
    });
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
