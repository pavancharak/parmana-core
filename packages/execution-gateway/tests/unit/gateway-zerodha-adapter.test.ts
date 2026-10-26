import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  ConnectorExecutionContext,
  ConnectorRequest,
} from "@parmana/connector-sdk";
import { PaperOrderValidationError } from "@parmana/connector-zerodha";

import {
  GatewayZerodhaAdapter,
  createGatewayZerodhaConnector,
  requireZerodhaLiveApproval,
  type ZerodhaLiveApproval,
} from "../../src/connector-execution/GatewayZerodhaAdapter.js";

const approval: ZerodhaLiveApproval = {
  sebiCircularReviewRef: "compliance-review-001",
  kiteApiApprovalRef: "zerodha-approval-001",
  approvedBy: "operator",
};

const credentialContext = {
  credential: { value: { apiKey: "key-123", accessToken: "token-456" } },
} as unknown as ConnectorExecutionContext;

const emptyContext = {} as ConnectorExecutionContext;

function orderRequest(parameters: Record<string, unknown>): ConnectorRequest {
  return {
    capability: "zerodha:place-order",
    businessTransactionId: "txn-zerodha-1",
    action: "place-order",
    target: "NSE:INFY",
    parameters: {
      tradingsymbol: "INFY",
      exchange: "NSE",
      transactionType: "BUY",
      quantity: 1,
      orderType: "MARKET",
      product: "CNC",
      ...parameters,
    },
  };
}

function liveFetch(
  respond: () => Response,
  calls: { url: string; init: RequestInit }[],
): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  }) as unknown as typeof fetch;
}

describe("GatewayZerodhaAdapter (paper mode)", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("records a valid order and returns a simulated id, with no credential", async () => {
    const adapter = new GatewayZerodhaAdapter({
      connectorId: "zerodha",
      mode: "paper",
    });

    const response = await adapter.execute(orderRequest({}), emptyContext);

    expect(response.success).toBe(true);
    expect(response.metadata).toEqual({
      mode: "paper",
      orderId: "PAPER-000001",
      status: "PAPER_ACCEPTED",
    });
  });

  it("declares only zerodha:place-order", () => {
    const adapter = new GatewayZerodhaAdapter({
      connectorId: "zerodha",
      mode: "paper",
    });

    expect(adapter.capabilities.includes("zerodha:place-order")).toBe(true);
    expect(adapter.capabilities.includes("zerodha:cancel-order")).toBe(false);
  });

  it("refuses a capability it does not declare", async () => {
    const adapter = new GatewayZerodhaAdapter({
      connectorId: "zerodha",
      mode: "paper",
    });

    await expect(
      adapter.execute(
        { ...orderRequest({}), capability: "zerodha:cancel-order" },
        emptyContext,
      ),
    ).rejects.toThrow(/does not declare capability/);
  });

  it("passes order values to the validator, which rejects invalid ones", async () => {
    const adapter = new GatewayZerodhaAdapter({
      connectorId: "zerodha",
      mode: "paper",
    });

    await expect(
      adapter.execute(orderRequest({ quantity: 0 }), emptyContext),
    ).rejects.toThrow(PaperOrderValidationError);
  });

  it("refuses a parameter of the wrong type", async () => {
    const adapter = new GatewayZerodhaAdapter({
      connectorId: "zerodha",
      mode: "paper",
    });

    await expect(
      adapter.execute(orderRequest({ quantity: "1" }), emptyContext),
    ).rejects.toThrow(/quantity/);
    await expect(
      adapter.execute(orderRequest({ tradingsymbol: 42 }), emptyContext),
    ).rejects.toThrow(/tradingsymbol/);
  });

  it("refuses a missing quantity", async () => {
    const adapter = new GatewayZerodhaAdapter({
      connectorId: "zerodha",
      mode: "paper",
    });
    const request = orderRequest({});
    const { quantity: _removed, ...parameters } = request.parameters;

    await expect(
      adapter.execute({ ...request, parameters }, emptyContext),
    ).rejects.toThrow(/quantity/);
  });

  it("refuses a variety other than regular", async () => {
    const adapter = new GatewayZerodhaAdapter({
      connectorId: "zerodha",
      mode: "paper",
    });

    await expect(
      adapter.execute(orderRequest({ variety: "amo" }), emptyContext),
    ).rejects.toThrow(/variety/);
  });

  it("is frozen after construction", () => {
    expect(
      Object.isFrozen(
        new GatewayZerodhaAdapter({ connectorId: "zerodha", mode: "paper" }),
      ),
    ).toBe(true);
  });
});

describe("GatewayZerodhaAdapter (live mode)", () => {
  it("refuses to construct without an approval record", () => {
    expect(
      () =>
        new GatewayZerodhaAdapter({
          connectorId: "zerodha",
          mode: "live",
        } as never),
    ).toThrow(/approval record/);
  });

  it("refuses an approval with any field empty", () => {
    for (const field of [
      "sebiCircularReviewRef",
      "kiteApiApprovalRef",
      "approvedBy",
    ] as const) {
      expect(() =>
        requireZerodhaLiveApproval("zerodha", { ...approval, [field]: "  " }),
      ).toThrow(new RegExp(field));
    }
  });

  it("sends the order to Kite with the approved credentials", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const adapter = new GatewayZerodhaAdapter({
      connectorId: "zerodha",
      mode: "live",
      approval,
      fetchImpl: liveFetch(
        () =>
          new Response(
            JSON.stringify({
              status: "success",
              data: { order_id: "240101000000001" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        calls,
      ),
    });

    const response = await adapter.execute(orderRequest({}), credentialContext);

    expect(response).toEqual({
      success: true,
      metadata: { mode: "live", orderId: "240101000000001" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.kite.trade/orders/regular");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("token key-123:token-456");
  });

  it("refuses a credential that is not a Kite key and token", async () => {
    const adapter = new GatewayZerodhaAdapter({
      connectorId: "zerodha",
      mode: "live",
      approval,
      fetchImpl: liveFetch(() => new Response("{}"), []),
    });

    await expect(
      adapter.execute(orderRequest({}), {
        credential: { value: "not-a-credential" },
      } as unknown as ConnectorExecutionContext),
    ).rejects.toThrow(/not a resolved Kite api key and access token/);
  });

  it("reports an unknown outcome when Kite does not confirm the order", async () => {
    const adapter = new GatewayZerodhaAdapter({
      connectorId: "zerodha",
      mode: "live",
      approval,
      fetchImpl: liveFetch(
        () =>
          new Response(JSON.stringify({ status: "error" }), { status: 500 }),
        [],
      ),
    });

    await expect(
      adapter.execute(orderRequest({}), credentialContext),
    ).rejects.toThrow(/outcome is unknown/);
  });
});

describe("createGatewayZerodhaConnector", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("builds a paper connector outside production", () => {
    process.env.NODE_ENV = "test";

    const connector = createGatewayZerodhaConnector({
      connectorId: "zerodha",
      mode: "paper",
    });

    expect(connector.connectorId).toBe("zerodha");
  });

  it("refuses paper mode in production", () => {
    process.env.NODE_ENV = "production";

    expect(() =>
      createGatewayZerodhaConnector({ connectorId: "zerodha", mode: "paper" }),
    ).toThrow(/not allowed in production/);
  });

  it("refuses live mode without an approval record in any environment", () => {
    process.env.NODE_ENV = "test";

    expect(() =>
      createGatewayZerodhaConnector({
        connectorId: "zerodha",
        mode: "live",
      } as unknown as Parameters<typeof createGatewayZerodhaConnector>[0]),
    ).toThrow(/approval record/);
  });
});
