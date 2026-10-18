import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  brandCredentialHandle,
  connectorCapabilities,
  type ConnectorExecutionContext,
  type ConnectorRequest,
} from "@parmana/connector-sdk";

import { GatewayHttpAdapter } from "../../src/connector-execution/index.js";

let server: Server;
let baseUrl: string;
let lastRequest:
  | {
      method?: string;
      url?: string;
      headers: IncomingMessage["headers"];
      body: string;
    }
  | undefined;
let responseDelayMs = 0;
let responseStatus = 200;

function handler(req: IncomingMessage, res: ServerResponse): void {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    lastRequest = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: Buffer.concat(chunks).toString("utf8"),
    };
    setTimeout(() => {
      res.writeHead(responseStatus, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: responseStatus < 300 }));
    }, responseDelayMs);
  });
}

beforeEach(async () => {
  lastRequest = undefined;
  responseDelayMs = 0;
  responseStatus = 200;
  server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function context(
  overrides: Partial<ConnectorExecutionContext> = {},
): ConnectorExecutionContext {
  return {
    credential: brandCredentialHandle({
      providerId: "static",
      credentialId: "stripe",
      value: { token: "sk_test_123" },
    }),
    timeoutMs: 2_000,
    requestedAt: new Date(),
    ...overrides,
  };
}

function request(overrides: Partial<ConnectorRequest> = {}): ConnectorRequest {
  return {
    capability: "http:post",
    businessTransactionId: "txn-1",
    action: "http:post",
    target: "/charges",
    parameters: { amount: 1000, currency: "usd" },
    ...overrides,
  };
}

describe("GatewayHttpAdapter", () => {
  it("executes a declared capability, injecting the resolved credential as a Bearer token", async () => {
    const connector = new GatewayHttpAdapter({
      connectorId: "stripe",
      capabilities: connectorCapabilities(["http:post"]),
      baseUrl,
    });

    const result = await connector.execute(request(), context());

    expect(result.success).toBe(true);
    expect(lastRequest?.method).toBe("POST");
    expect(lastRequest?.url).toBe("/charges");
    expect(lastRequest?.headers.authorization).toBe("Bearer sk_test_123");
    expect(JSON.parse(lastRequest?.body ?? "{}")).toEqual({
      amount: 1000,
      currency: "usd",
    });
  });

  it("derives the HTTP method from the http: namespaced capability", async () => {
    const connector = new GatewayHttpAdapter({
      connectorId: "stripe",
      capabilities: connectorCapabilities(["http:get"]),
      baseUrl,
    });

    await connector.execute(
      request({
        capability: "http:get",
        action: "http:get",
        target: "/accounts/1",
      }),
      context(),
    );

    expect(lastRequest?.method).toBe("GET");
  });

  it("fails closed on a non-2xx response", async () => {
    responseStatus = 500;
    const connector = new GatewayHttpAdapter({
      connectorId: "stripe",
      capabilities: connectorCapabilities(["http:post"]),
      baseUrl,
    });

    await expect(connector.execute(request(), context())).rejects.toThrow(
      "HTTP 500",
    );
  });

  it("fails closed on a timeout, never returning a partial success", async () => {
    responseDelayMs = 200;
    const connector = new GatewayHttpAdapter({
      connectorId: "stripe",
      capabilities: connectorCapabilities(["http:post"]),
      baseUrl,
    });

    await expect(
      connector.execute(request(), context({ timeoutMs: 20 })),
    ).rejects.toThrow("timed out after 20ms");
  });

  it("rejects a capability the connector did not declare", async () => {
    const connector = new GatewayHttpAdapter({
      connectorId: "stripe",
      capabilities: connectorCapabilities(["http:get"]),
      baseUrl,
    });

    await expect(
      connector.execute(request({ capability: "http:post" }), context()),
    ).rejects.toThrow('does not declare capability "http:post"');
  });

  it("forwards additional configured headers on the request", async () => {
    const connector = new GatewayHttpAdapter({
      connectorId: "stripe",
      capabilities: connectorCapabilities(["http:post"]),
      baseUrl,
      headers: { "X-Connector": "stripe" },
    });

    await connector.execute(request(), context());
    expect(lastRequest?.headers["x-connector"]).toBe("stripe");
  });
});
