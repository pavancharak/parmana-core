import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MockSlackServer,
  SLACK_POST_MESSAGE_CAPABILITY,
  SLACK_TEST_MODE_PLACEHOLDER_TOKEN,
  redactSlackToken,
} from "@parmana/connector-slack";
import {
  brandCredentialHandle,
  connectorCapabilities,
  type ConnectorExecutionContext,
} from "@parmana/connector-sdk";

import { GatewaySlackAdapter } from "../../src/connector-execution/index.js";

const TOKEN = SLACK_TEST_MODE_PLACEHOLDER_TOKEN;

let server: MockSlackServer;

beforeEach(async () => {
  server = new MockSlackServer({ botToken: TOKEN });
  await server.listen();
});

afterEach(async () => {
  await server.close();
});

function context(
  overrides: Partial<ConnectorExecutionContext> = {},
): ConnectorExecutionContext {
  return {
    credential: brandCredentialHandle({
      providerId: "static",
      credentialId: "slack",
      value: { botToken: TOKEN },
    }),
    timeoutMs: 2_000,
    requestedAt: new Date(),
    ...overrides,
  };
}

function connector(baseUrl: string = server.baseUrl): GatewaySlackAdapter {
  return new GatewaySlackAdapter({
    connectorId: "slack",
    capabilities: connectorCapabilities([SLACK_POST_MESSAGE_CAPABILITY]),
    baseUrl,
  });
}

function postMessageRequest(
  overrides: Partial<{ channel: string; text: string }> = {},
) {
  const channel = overrides.channel ?? "C0123456789";
  return {
    capability: SLACK_POST_MESSAGE_CAPABILITY,
    businessTransactionId: "btx-1",
    action: SLACK_POST_MESSAGE_CAPABILITY,
    target: channel,
    parameters: {
      channel,
      text: overrides.text ?? "Hello from Parmana",
    },
  };
}

describe("GatewaySlackAdapter", () => {
  it("posts an approved message to Slack exactly once", async () => {
    const result = await connector().execute(postMessageRequest(), context());

    expect(result.success).toBe(true);
    expect(result.metadata?.channel).toBe("C0123456789");
    expect(typeof result.metadata?.ts).toBe("string");
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]?.channel).toBe("C0123456789");
    expect(server.calls[0]?.text).toBe("Hello from Parmana");
  });

  it("deny-by-default: refuses an unsupported parameter before any network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      connector().execute(
        {
          ...postMessageRequest(),
          parameters: { channel: "C0123456789", text: "hi", asUser: true },
        },
        context(),
      ),
    ).rejects.toThrow(/asUser/);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(server.calls).toHaveLength(0);
    fetchSpy.mockRestore();
  });

  it("rejects a request for a capability the connector does not declare, before any network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      connector().execute(
        {
          ...postMessageRequest(),
          capability: "slack:delete-message",
          action: "slack:delete-message",
        },
        context(),
      ),
    ).rejects.toThrow(/does not declare capability/);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("G-76: refuses to post to a channel other than the authorized target, before any network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      connector().execute(
        {
          ...postMessageRequest({ channel: "C_OTHER" }),
          target: "C0123456789",
        },
        context(),
      ),
    ).rejects.toThrow(/is not the authorized target/);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(server.calls).toHaveLength(0);
    fetchSpy.mockRestore();
  });

  it("rejects a credential that is not a resolved Slack bot token", async () => {
    await expect(
      connector().execute(
        postMessageRequest(),
        context({
          credential: brandCredentialHandle({
            providerId: "static",
            credentialId: "slack",
            value: { token: "wrong-shape" },
          }),
        }),
      ),
    ).rejects.toThrow(/resolved Slack bot token/);
  });

  it("fails closed when Slack answers HTTP 200 with ok:false -- HTTP status alone is not enough", async () => {
    server.setForcedError("channel_not_found");

    await expect(
      connector().execute(postMessageRequest(), context()),
    ).rejects.toThrow(/channel_not_found/);
  });

  it("fails closed on a non-2xx response from Slack", async () => {
    server.setForcedHttpStatus(500);

    await expect(
      connector().execute(postMessageRequest(), context()),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("fails closed on a timeout, never returning a partial success", async () => {
    server.setResponseDelayMs(200);

    await expect(
      connector().execute(postMessageRequest(), context({ timeoutMs: 20 })),
    ).rejects.toThrow(/timed out after 20ms/);
  });

  it("never places the bot token or any substring of it in connector response metadata, only a one-way fingerprint", async () => {
    const result = await connector().execute(postMessageRequest(), context());

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TOKEN);
    expect(result.metadata?.bearerRedacted).toBe(redactSlackToken(TOKEN));
    expect(result.metadata?.bearerRedacted).toMatch(/^fp_[0-9a-f]{12}$/);
  });

  it("never leaks the bot token into a thrown error, even on an authentication failure against the mock server", async () => {
    let caught: unknown;
    try {
      await connector().execute(
        postMessageRequest(),
        context({
          credential: brandCredentialHandle({
            providerId: "static",
            credentialId: "slack",
            value: { botToken: "xoxb-wrong-token" },
          }),
        }),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).not.toContain(TOKEN);
    expect((caught as Error).message).not.toContain("xoxb-wrong-token");
  });

  it("refuses to send the built-in test-mode placeholder token to a non-local endpoint, before any network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const remoteConnector = new GatewaySlackAdapter({
      connectorId: "slack",
      capabilities: connectorCapabilities([SLACK_POST_MESSAGE_CAPABILITY]),
      baseUrl: "https://slack-lookalike.internal.example.com",
    });

    await expect(
      remoteConnector.execute(postMessageRequest(), context()),
    ).rejects.toThrow(/refuses to send/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("requires HTTPS outside NODE_ENV=test", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(
        () =>
          new GatewaySlackAdapter({
            connectorId: "slack",
            capabilities: connectorCapabilities([
              SLACK_POST_MESSAGE_CAPABILITY,
            ]),
            baseUrl: "http://slack-lookalike.internal.example.com",
          }),
      ).toThrow(/HTTPS/);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
