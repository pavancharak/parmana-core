import { describe, expect, it } from "vitest";

import {
  KiteLiveClient,
  isKiteCredentials,
  type KiteCredentials,
} from "../../src/KiteLiveClient.js";
import type { PaperOrderRequest } from "../../src/PaperKiteClient.js";

const credentials: KiteCredentials = {
  apiKey: "key-123",
  accessToken: "token-456",
};

const market: PaperOrderRequest = {
  tradingsymbol: "INFY",
  exchange: "NSE",
  transactionType: "BUY",
  quantity: 2,
  orderType: "MARKET",
  product: "CNC",
};

interface Captured {
  url: string;
  init: RequestInit;
}

function fakeFetch(
  respond: () => Response,
  captured: Captured[],
): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), init: init ?? {} });
    return respond();
  }) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("KiteLiveClient", () => {
  it("posts a form-encoded order with the Kite v3 headers and returns the order id", async () => {
    const captured: Captured[] = [];
    const client = new KiteLiveClient({
      fetchImpl: fakeFetch(
        () =>
          jsonResponse({
            status: "success",
            data: { order_id: "240101000000001" },
          }),
        captured,
      ),
    });

    const result = await client.placeOrder(market, credentials);

    expect(result).toEqual({ orderId: "240101000000001" });
    expect(captured).toHaveLength(1);
    const [call] = captured;
    expect(call.url).toBe("https://api.kite.trade/orders/regular");
    expect(call.init.method).toBe("POST");
    const headers = call.init.headers as Record<string, string>;
    expect(headers["X-Kite-Version"]).toBe("3");
    expect(headers.Authorization).toBe("token key-123:token-456");
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(String(call.init.body));
    expect(body.get("tradingsymbol")).toBe("INFY");
    expect(body.get("exchange")).toBe("NSE");
    expect(body.get("transaction_type")).toBe("BUY");
    expect(body.get("quantity")).toBe("2");
    expect(body.get("order_type")).toBe("MARKET");
    expect(body.get("product")).toBe("CNC");
    expect(body.has("price")).toBe(false);
    expect(body.has("trigger_price")).toBe(false);
  });

  it("sends price and trigger price only when the order has them", async () => {
    const captured: Captured[] = [];
    const client = new KiteLiveClient({
      fetchImpl: fakeFetch(
        () => jsonResponse({ status: "success", data: { order_id: "1" } }),
        captured,
      ),
    });

    await client.placeOrder(
      { ...market, orderType: "SL", price: 1500, triggerPrice: 1490 },
      credentials,
    );

    const body = new URLSearchParams(String(captured[0].init.body));
    expect(body.get("price")).toBe("1500");
    expect(body.get("trigger_price")).toBe("1490");
  });

  it("validates the order before any request is sent", async () => {
    const captured: Captured[] = [];
    const client = new KiteLiveClient({
      fetchImpl: fakeFetch(() => jsonResponse({}), captured),
    });

    await expect(
      client.placeOrder({ ...market, quantity: 0 }, credentials),
    ).rejects.toThrow(/quantity/);
    expect(captured).toHaveLength(0);
  });

  it("reports an unknown outcome when the request fails in transit", async () => {
    const client = new KiteLiveClient({
      fetchImpl: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    });

    await expect(client.placeOrder(market, credentials)).rejects.toThrow(
      /may or may not have been placed/,
    );
  });

  it("reports an unknown outcome when Kite answers with an error", async () => {
    const client = new KiteLiveClient({
      fetchImpl: fakeFetch(
        () =>
          jsonResponse({ status: "error", message: "Insufficient funds" }, 400),
        [],
      ),
    });

    await expect(client.placeOrder(market, credentials)).rejects.toThrow(
      /did not confirm the order \(HTTP 400\)/,
    );
  });

  it("reports an unknown outcome when a success response has no order id", async () => {
    const client = new KiteLiveClient({
      fetchImpl: fakeFetch(
        () => jsonResponse({ status: "success", data: {} }),
        [],
      ),
    });

    await expect(client.placeOrder(market, credentials)).rejects.toThrow(
      /outcome is unknown/,
    );
  });

  it("does not put the access token into the error message", async () => {
    const client = new KiteLiveClient({
      fetchImpl: fakeFetch(() => jsonResponse({ status: "error" }, 403), []),
    });

    const error = await client
      .placeOrder(market, credentials)
      .catch((caught: unknown) => caught);

    expect(String(error)).not.toContain("token-456");
    expect(String(error)).not.toContain("key-123");
  });

  it("never retries a failed order request", async () => {
    const captured: Captured[] = [];
    const client = new KiteLiveClient({
      fetchImpl: fakeFetch(
        () => jsonResponse({ status: "error" }, 500),
        captured,
      ),
    });

    await expect(client.placeOrder(market, credentials)).rejects.toThrow();
    expect(captured).toHaveLength(1);
  });

  it("refuses a plaintext base URL", () => {
    expect(
      () => new KiteLiveClient({ baseUrl: "http://localhost:9999" }),
    ).toThrow(/HTTPS/);
  });

  it("is frozen after construction", () => {
    expect(Object.isFrozen(new KiteLiveClient())).toBe(true);
  });
});

describe("isKiteCredentials", () => {
  it("accepts non-empty api key and access token", () => {
    expect(isKiteCredentials(credentials)).toBe(true);
  });

  it("rejects missing, empty, or non-object values", () => {
    expect(isKiteCredentials(undefined)).toBe(false);
    expect(isKiteCredentials("token")).toBe(false);
    expect(isKiteCredentials({ apiKey: "key" })).toBe(false);
    expect(isKiteCredentials({ apiKey: " ", accessToken: "t" })).toBe(false);
  });
});
