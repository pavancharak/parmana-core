import { describe, expect, it } from "vitest";
import {
  PaperKiteClient,
  PaperOrderValidationError,
  type PaperOrderRequest,
} from "../../src/PaperKiteClient.js";

const market: PaperOrderRequest = {
  tradingsymbol: "INFY",
  exchange: "NSE",
  transactionType: "BUY",
  quantity: 1,
  orderType: "MARKET",
  product: "CNC",
};

describe("PaperKiteClient", () => {
  it("accepts a valid market order and returns a simulated id", () => {
    const client = new PaperKiteClient();
    const record = client.placeOrder(market);

    expect(record.orderId).toBe("PAPER-000001");
    expect(record.status).toBe("PAPER_ACCEPTED");
    expect(record.request).toEqual(market);
  });

  it("numbers orders sequentially and keeps them oldest first", () => {
    const client = new PaperKiteClient();
    client.placeOrder(market);
    client.placeOrder({ ...market, transactionType: "SELL" });

    const ids = client.orders().map((order) => order.orderId);
    expect(ids).toEqual(["PAPER-000001", "PAPER-000002"]);
  });

  it("returns a copy so callers cannot change the recorded orders", () => {
    const client = new PaperKiteClient();
    client.placeOrder(market);

    const snapshot = client.orders() as unknown as unknown[];
    snapshot.length = 0;

    expect(client.orders()).toHaveLength(1);
  });

  it("requires a price for LIMIT orders", () => {
    const client = new PaperKiteClient();

    expect(() => client.placeOrder({ ...market, orderType: "LIMIT" })).toThrow(
      PaperOrderValidationError,
    );
    expect(() =>
      client.placeOrder({ ...market, orderType: "LIMIT", price: 1500 }),
    ).not.toThrow();
  });

  it("requires a trigger price for stop-loss orders", () => {
    const client = new PaperKiteClient();

    expect(() => client.placeOrder({ ...market, orderType: "SL-M" })).toThrow(
      /triggerPrice/,
    );
    expect(() =>
      client.placeOrder({ ...market, orderType: "SL", price: 1500 }),
    ).toThrow(/triggerPrice/);
  });

  it("rejects non-positive or fractional quantities", () => {
    const client = new PaperKiteClient();

    expect(() => client.placeOrder({ ...market, quantity: 0 })).toThrow(
      /quantity/,
    );
    expect(() => client.placeOrder({ ...market, quantity: 1.5 })).toThrow(
      /quantity/,
    );
  });

  it("rejects an unknown exchange, product, or transaction type", () => {
    const client = new PaperKiteClient();

    expect(() =>
      client.placeOrder({
        ...market,
        exchange: "XYZ" as PaperOrderRequest["exchange"],
      }),
    ).toThrow(/exchange/);
    expect(() =>
      client.placeOrder({
        ...market,
        product: "BO" as PaperOrderRequest["product"],
      }),
    ).toThrow(/product/);
    expect(() =>
      client.placeOrder({
        ...market,
        transactionType: "HOLD" as PaperOrderRequest["transactionType"],
      }),
    ).toThrow(/transactionType/);
  });

  it("rejects an empty tradingsymbol", () => {
    const client = new PaperKiteClient();

    expect(() => client.placeOrder({ ...market, tradingsymbol: "  " })).toThrow(
      /tradingsymbol/,
    );
  });

  it("records nothing when validation fails", () => {
    const client = new PaperKiteClient();

    expect(() => client.placeOrder({ ...market, quantity: 0 })).toThrow();
    expect(client.orders()).toHaveLength(0);
  });
});
