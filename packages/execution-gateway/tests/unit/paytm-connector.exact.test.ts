import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MockPaytmConnectorServer,
  PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
  PAYTM_REFUND_CAPABILITY,
} from "@parmana/connector-paytm";
import {
  brandCredentialHandle,
  connectorCapabilities,
  type ConnectorExecutionContext,
} from "@parmana/connector-sdk";

import { GatewayPaytmAdapter } from "../../src/connector-execution/index.js";

/**
 * Mutation testing found the Paytm adapter's input checks tested only
 * loosely: a missing order or transaction id, an amount that is not a
 * finite number, the exact length limit of a refund reference, and the
 * HTTPS and local-target checks could change without a test failing.
 */

const SECRET = PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET;

let server: MockPaytmConnectorServer;

beforeEach(async () => {
  server = new MockPaytmConnectorServer({ sharedSecret: SECRET });
  await server.listen();
});

afterEach(async () => {
  await server.close();
  vi.restoreAllMocks();
});

const context = (): ConnectorExecutionContext => ({
  credential: brandCredentialHandle({
    providerId: "static",
    credentialId: "paytm",
    value: { sharedSecret: SECRET },
  }),
  timeoutMs: 2_000,
  requestedAt: new Date(),
});

const adapter = (baseUrl: string = server.baseUrl) =>
  new GatewayPaytmAdapter({
    connectorId: "paytm",
    capabilities: connectorCapabilities([PAYTM_REFUND_CAPABILITY]),
    baseUrl,
  });

const refund = (parameters: Record<string, unknown>) => ({
  capability: PAYTM_REFUND_CAPABILITY,
  businessTransactionId: "btx-1",
  action: PAYTM_REFUND_CAPABILITY,
  target: "paytm://orders/order-1",
  parameters: {
    orderId: "order-1",
    transactionId: "txn-1",
    amount: 500,
    ...parameters,
  },
});

describe("GatewayPaytmAdapter, exactly", () => {
  it.each([
    ["orderId", { orderId: undefined }],
    ["orderId", { orderId: "" }],
    ["orderId", { orderId: 7 }],
    ["transactionId", { transactionId: undefined }],
    ["transactionId", { transactionId: "" }],
  ])(
    "refuses a missing or empty %s before any network call",
    async (field, parameters) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      await expect(
        adapter().execute(refund(parameters), context()),
      ).rejects.toThrow(
        `PaytmConnector request is missing required field "parameters.${field}".`,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it.each([["500"], [Number.NaN], [Number.POSITIVE_INFINITY], [null]])(
    "refuses an amount of %s",
    async (amount) => {
      await expect(
        adapter().execute(refund({ amount }), context()),
      ).rejects.toThrow(
        'PaytmConnector request field "parameters.amount" must be a finite number.',
      );
    },
  );

  it("accepts a refund reference of exactly 128 characters", async () => {
    await expect(
      adapter().execute(
        refund({ refundReference: "r".repeat(128) }),
        context(),
      ),
    ).resolves.toMatchObject({ success: true });
  });

  it("allows the test placeholder secret to a localhost target", async () => {
    const local = adapter(server.baseUrl.replace("127.0.0.1", "localhost"));
    const outcome = await local.execute(refund({}), context()).then(
      () => "sent",
      (error: Error) => error.message,
    );
    // It is sent (or fails on the network), never refused as non-local.
    expect(outcome).not.toMatch(/placeholder/);
  });

  it("accepts an HTTPS endpoint outside NODE_ENV=test", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() =>
        adapter("https://paytm-connector.example.com"),
      ).not.toThrow();
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});
