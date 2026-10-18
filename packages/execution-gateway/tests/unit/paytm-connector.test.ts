import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MockPaytmConnectorServer,
  PAYTM_AGENT_WIRE_ACTION,
  PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
  PAYTM_REFUND_CAPABILITY,
  canonicalPaytmAuthorizationString,
  deriveDeterministicPaytmRefId,
  redactPaytmConnectorSecret,
} from "@parmana/connector-paytm";
import { SignerBootstrap } from "@parmana/crypto";
import {
  brandCredentialHandle,
  connectorCapabilities,
  type ConnectorExecutionContext,
} from "@parmana/connector-sdk";

import { GatewayPaytmAdapter } from "../../src/connector-execution/index.js";

const SECRET = PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET;

let server: MockPaytmConnectorServer;

beforeEach(async () => {
  server = new MockPaytmConnectorServer({ sharedSecret: SECRET });
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
      credentialId: "paytm",
      value: { sharedSecret: SECRET },
    }),
    timeoutMs: 2_000,
    requestedAt: new Date(),
    ...overrides,
  };
}

function connector(baseUrl: string = server.baseUrl): GatewayPaytmAdapter {
  return new GatewayPaytmAdapter({
    connectorId: "paytm",
    capabilities: connectorCapabilities([PAYTM_REFUND_CAPABILITY]),
    baseUrl,
  });
}

function refundRequest(
  overrides: Partial<{
    businessTransactionId: string;
    orderId: string;
    transactionId: string;
    amount: number;
  }> = {},
) {
  return {
    capability: PAYTM_REFUND_CAPABILITY,
    businessTransactionId: overrides.businessTransactionId ?? "btx-1",
    action: PAYTM_REFUND_CAPABILITY,
    target: `paytm://orders/${overrides.orderId ?? "order-1"}`,
    parameters: {
      orderId: overrides.orderId ?? "order-1",
      transactionId: overrides.transactionId ?? "txn-1",
      amount: overrides.amount ?? 500,
    },
  };
}

describe("GatewayPaytmAdapter", () => {
  it("forwards an approved refund to the Paytm connector service exactly once, and the mock forwards to Paytm exactly once", async () => {
    const result = await connector().execute(refundRequest(), context());

    expect(result.success).toBe(true);
    expect(typeof result.metadata?.refId).toBe("string");
    expect(server.calls).toHaveLength(1);
    expect(server.paytmInvocationCount).toBe(1);
  });

  it("sends the real wire contract: {transaction, authorization} envelope with txnId/refId/hyphenated action, not the flattened ConnectorRequest", async () => {
    await connector().execute(
      refundRequest({
        orderId: "order-42",
        transactionId: "txn-42",
        amount: 750,
      }),
      context(),
    );

    expect(server.calls[0]?.businessTransactionId).toBe("btx-1");
    expect(server.calls[0]?.action).toBe("paytm-refund");
    expect(server.calls[0]?.parameters).toEqual({
      orderId: "order-42",
      txnId: "txn-42",
      refId: deriveDeterministicPaytmRefId("order-42", "txn-42"),
      amount: "750.00",
    });
  });

  it("refuses an amount with more than two decimals before forwarding, so the refund matches its evidence", async () => {
    await expect(
      connector().execute(refundRequest({ amount: 49.999 }), context()),
    ).rejects.toThrow(/at most two decimal places/);
    expect(server.calls).toHaveLength(0);
  });

  it("accepts an amount with two decimals", async () => {
    const result = await connector().execute(
      refundRequest({ amount: 49.99 }),
      context(),
    );

    expect(result.success).toBe(true);
    expect(server.calls[0]?.parameters.amount).toBe("49.99");
  });

  it("G-71: a refundReference makes the refId per refund, and a refundReason is sent as reason", async () => {
    const withReference = (refundReference: string) => ({
      ...refundRequest({ orderId: "order-7", transactionId: "txn-7" }),
      parameters: {
        orderId: "order-7",
        transactionId: "txn-7",
        amount: 100,
        refundReference,
        refundReason: "Arrived damaged",
      },
    });

    await connector().execute(withReference("REF-A"), context());
    await connector().execute(withReference("REF-A"), context());
    await connector().execute(withReference("REF-B"), context());

    const refIds = server.calls.map((call) => call.parameters.refId);
    expect(refIds[0]).toBe(
      deriveDeterministicPaytmRefId("order-7", "txn-7", "REF-A"),
    );
    expect(refIds[1]).toBe(refIds[0]);
    expect(refIds[2]).toBe(
      deriveDeterministicPaytmRefId("order-7", "txn-7", "REF-B"),
    );
    expect(refIds[2]).not.toBe(refIds[0]);
    expect(server.calls[0]?.parameters.reason).toBe("Arrived damaged");
  });

  it("G-71: sends no reason when none is given, and keeps the old refId without a reference", async () => {
    await connector().execute(
      refundRequest({ orderId: "order-8", transactionId: "txn-8" }),
      context(),
    );

    expect(server.calls[0]?.parameters).not.toHaveProperty("reason");
    expect(server.calls[0]?.parameters.refId).toBe(
      deriveDeterministicPaytmRefId("order-8", "txn-8"),
    );
  });

  it.each([
    ["an empty refundReference", { refundReference: "  " }],
    ["a refundReference that is not a string", { refundReference: 42 }],
    [
      "a refundReference over 128 characters",
      { refundReference: "r".repeat(129) },
    ],
    ["a refundReason over 256 characters", { refundReason: "x".repeat(257) }],
  ])("G-71: refuses %s before any network call", async (_label, extra) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      connector().execute(
        {
          ...refundRequest(),
          parameters: {
            orderId: "order-1",
            transactionId: "txn-1",
            amount: 500,
            ...extra,
          },
        },
        context(),
      ),
    ).rejects.toThrow(/must be a non empty string of at most/);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("deny-by-default: refuses an unsupported parameter before any network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      connector().execute(
        {
          ...refundRequest(),
          parameters: {
            orderId: "order-1",
            transactionId: "txn-1",
            amount: 500,
            merchantOverride: "evil",
          },
        },
        context(),
      ),
    ).rejects.toThrow(/merchantOverride/);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(server.calls).toHaveLength(0);
    fetchSpy.mockRestore();
  });

  it("rejects a request for a capability the connector does not declare, before any network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      connector().execute(
        {
          ...refundRequest(),
          capability: "paytm:charge",
          action: "paytm:charge",
        },
        context(),
      ),
    ).rejects.toThrow(/does not declare capability/);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("rejects a credential that is not a resolved connector shared secret", async () => {
    await expect(
      connector().execute(
        refundRequest(),
        context({
          credential: brandCredentialHandle({
            providerId: "static",
            credentialId: "paytm",
            value: { token: "wrong-shape" },
          }),
        }),
      ),
    ).rejects.toThrow(/resolved connector shared secret/);
  });

  it("fails closed when the connector service returns 401 (invalid connector authentication) -- Paytm is never invoked", async () => {
    await expect(
      connector().execute(
        refundRequest(),
        context({
          credential: brandCredentialHandle({
            providerId: "static",
            credentialId: "paytm",
            value: { sharedSecret: "wrong-secret" },
          }),
        }),
      ),
    ).rejects.toThrow(/HTTP 401/);

    expect(server.paytmInvocationCount).toBe(0);
  });

  it("fails closed on a non-2xx response from the connector service", async () => {
    server.setForcedHttpStatus(500);

    await expect(
      connector().execute(refundRequest(), context()),
    ).rejects.toThrow(/HTTP 500/);
    expect(server.paytmInvocationCount).toBe(0);
  });

  it("fails closed on a malformed connector-service response", async () => {
    server.setMalformedResponse(true);

    await expect(
      connector().execute(refundRequest(), context()),
    ).rejects.toThrow(/malformed response/);
  });

  it("fails closed on a timeout, never returning a partial success", async () => {
    server.setResponseDelayMs(200);

    await expect(
      connector().execute(refundRequest(), context({ timeoutMs: 20 })),
    ).rejects.toThrow(/timed out after 20ms/);
  });

  it.each([
    ["businessTransactionId", { businessTransactionId: "some-other-btx" }],
    ["action", { action: "paytm-refund-v2" }],
  ])(
    "binding validation: rejects a connector-service response with a mismatched top-level %s",
    async (field, override) => {
      server.setResponseFieldOverride(override);

      await expect(
        connector().execute(refundRequest(), context()),
      ).rejects.toThrow(new RegExp(field));
    },
  );

  it.each([
    ["orderId", { orderId: "some-other-order" }],
    ["txnId", { txnId: "some-other-txn" }],
  ])(
    "binding validation: rejects a connector-service response with a mismatched parameters.%s",
    async (field, override) => {
      server.setResponseFieldOverride({ parameters: override });

      await expect(
        connector().execute(refundRequest(), context()),
      ).rejects.toThrow(new RegExp(field));
      // The mismatched response must never be trusted, even though the
      // mock's own internal "Paytm call" already happened.
      expect(server.paytmInvocationCount).toBe(1);
    },
  );

  it("returns a non-throwing, non-success result when Paytm declines the refund, with the raw result code surfaced", async () => {
    server.setForcedResultStatus("TXN_FAILURE");

    const result = await connector().execute(refundRequest(), context());

    expect(result.success).toBe(false);
    expect(result.metadata?.resultStatus).toBe("TXN_FAILURE");
    expect(server.paytmInvocationCount).toBe(0);
  });

  it("idempotency: a retried request for the same logical refund (orderId, transactionId) sends the same refId, regardless of businessTransactionId", async () => {
    const first = await connector().execute(
      refundRequest({ businessTransactionId: "btx-attempt-1" }),
      context(),
    );
    const second = await connector().execute(
      refundRequest({ businessTransactionId: "btx-attempt-2" }),
      context(),
    );

    expect(first.metadata?.refId).toBe(second.metadata?.refId);
    expect(first.metadata?.refId).toBe(
      deriveDeterministicPaytmRefId("order-1", "txn-1"),
    );
  });

  it("never places the shared secret or any substring of it in connector response metadata, only a one-way fingerprint", async () => {
    const result = await connector().execute(refundRequest(), context());

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SECRET);
    expect(result.metadata?.sharedSecretRedacted).toBe(
      redactPaytmConnectorSecret(SECRET),
    );
    expect(result.metadata?.sharedSecretRedacted).toMatch(/^fp_[0-9a-f]{12}$/);
  });

  it("never leaks the shared secret into a thrown error, even on an authentication failure against the mock server", async () => {
    let caught: unknown;
    try {
      await connector().execute(
        refundRequest(),
        context({
          credential: brandCredentialHandle({
            providerId: "static",
            credentialId: "paytm",
            value: { sharedSecret: "wrong-secret-value" },
          }),
        }),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).not.toContain(SECRET);
    expect((caught as Error).message).not.toContain("wrong-secret-value");
  });

  it("refuses to send the built-in test-mode placeholder secret to a non-local endpoint, before any network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const remoteConnector = new GatewayPaytmAdapter({
      connectorId: "paytm",
      capabilities: connectorCapabilities([PAYTM_REFUND_CAPABILITY]),
      baseUrl: "https://paytm-connector.internal.example.com",
    });

    await expect(
      remoteConnector.execute(refundRequest(), context()),
    ).rejects.toThrow(/refuses to send/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("ADR-0009 Phase 2B: signs the authorization -- attaches a signature/keyId/expiresAt the receiving service can independently verify", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await connector().execute(
      refundRequest({
        orderId: "order-sig",
        transactionId: "txn-sig",
        amount: 250,
      }),
      context(),
    );

    const [, init] = fetchSpy.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);

    expect(typeof sentBody.authorization.signature).toBe("string");
    expect(sentBody.authorization.signature.length).toBeGreaterThan(0);
    expect(typeof sentBody.authorization.keyId).toBe("string");
    expect(typeof sentBody.authorization.payload.expiresAt).toBe("number");
    expect(sentBody.authorization.payload.expiresAt).toBeGreaterThan(
      Date.now(),
    );

    // Independently verify -- proves this isn't just "some string", it's a
    // real signature over the exact canonical content a receiving service
    // (parmana-paytm-agent) would rebuild from the rest of this same body.
    const signer = await SignerBootstrap.create();
    const publicKey = await signer.getPublicKey(sentBody.authorization.keyId);
    const canonical = canonicalPaytmAuthorizationString({
      businessTransactionId: sentBody.transaction.businessTransactionId,
      action: sentBody.transaction.intent.action,
      orderId: sentBody.transaction.intent.parameters.orderId,
      txnId: sentBody.transaction.intent.parameters.txnId,
      amount: sentBody.transaction.intent.parameters.amount,
      expiresAt: sentBody.authorization.payload.expiresAt,
    });
    const { verify } = await import("node:crypto");
    expect(
      verify(
        null,
        Buffer.from(canonical, "utf8"),
        publicKey,
        Buffer.from(sentBody.authorization.signature, "base64"),
      ),
    ).toBe(true);

    fetchSpy.mockRestore();
  });

  it("ADR-0009 Phase 2B: the receiving service (mocked here) rejects a request with a valid shared secret but no signature at all", async () => {
    const response = await fetch(`${server.baseUrl}/connector/paytm-refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SECRET}`,
      },
      body: JSON.stringify({
        transaction: {
          businessTransactionId: "btx-forged",
          intent: {
            action: PAYTM_AGENT_WIRE_ACTION,
            target: "paytm://orders/order-1",
            parameters: {
              orderId: "order-1",
              txnId: "txn-1",
              refId: "refid_forged",
              amount: "999999.00",
            },
          },
        },
        authorization: {
          payload: {
            businessTransactionId: "btx-forged",
            expiresAt: Date.now() + 60_000,
          },
          // signature and keyId deliberately omitted.
        },
      }),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/authorization\.signature is required/);
  });

  it("ADR-0009 Phase 2B: rejects a well-formed but expired signature, even though it was genuinely signed by the real key", async () => {
    const signer = await SignerBootstrap.create();
    const expiresAt = Date.now() - 1_000; // already expired

    const canonical = canonicalPaytmAuthorizationString({
      businessTransactionId: "btx-expired",
      action: PAYTM_AGENT_WIRE_ACTION,
      orderId: "order-1",
      txnId: "txn-1",
      amount: "500.00",
      expiresAt,
    });
    const signature = await signer.sign(
      (await import("@parmana/crypto")).DEFAULT_KEY_ID,
      Buffer.from(canonical, "utf8"),
    );

    const response = await fetch(`${server.baseUrl}/connector/paytm-refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SECRET}`,
      },
      body: JSON.stringify({
        transaction: {
          businessTransactionId: "btx-expired",
          intent: {
            action: PAYTM_AGENT_WIRE_ACTION,
            target: "paytm://orders/order-1",
            parameters: {
              orderId: "order-1",
              txnId: "txn-1",
              refId: "refid_expired",
              amount: "500.00",
            },
          },
        },
        authorization: {
          payload: { businessTransactionId: "btx-expired", expiresAt },
          signature,
          keyId: (await import("@parmana/crypto")).DEFAULT_KEY_ID,
        },
      }),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/expired/);
  });

  it("ADR-0009 Phase 2B: rejects a request where the signature doesn't match the claimed content -- proves the shared secret alone is no longer sufficient to forge a refund", async () => {
    const { DEFAULT_KEY_ID } = await import("@parmana/crypto");
    const signer = await SignerBootstrap.create();
    const expiresAt = Date.now() + 60_000;

    // Sign one amount, then send a request claiming a different, much
    // larger amount -- exactly the attack this fix closes: previously,
    // anyone holding PAYTM_CONNECTOR_SHARED_SECRET alone could send any
    // self-chosen amount and it would be honored.
    const canonicalForSmallAmount = canonicalPaytmAuthorizationString({
      businessTransactionId: "btx-tamper",
      action: PAYTM_AGENT_WIRE_ACTION,
      orderId: "order-1",
      txnId: "txn-1",
      amount: "1.00",
      expiresAt,
    });
    const signature = await signer.sign(
      DEFAULT_KEY_ID,
      Buffer.from(canonicalForSmallAmount, "utf8"),
    );

    const response = await fetch(`${server.baseUrl}/connector/paytm-refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SECRET}`,
      },
      body: JSON.stringify({
        transaction: {
          businessTransactionId: "btx-tamper",
          intent: {
            action: PAYTM_AGENT_WIRE_ACTION,
            target: "paytm://orders/order-1",
            parameters: {
              orderId: "order-1",
              txnId: "txn-1",
              refId: "refid_tamper",
              amount: "999999.00", // tampered -- signature was over "1.00"
            },
          },
        },
        authorization: {
          payload: { businessTransactionId: "btx-tamper", expiresAt },
          signature,
          keyId: DEFAULT_KEY_ID,
        },
      }),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/signature is invalid/);
  });

  it("requires HTTPS outside NODE_ENV=test", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(
        () =>
          new GatewayPaytmAdapter({
            connectorId: "paytm",
            capabilities: connectorCapabilities([PAYTM_REFUND_CAPABILITY]),
            baseUrl: "http://paytm-connector.internal.example.com",
          }),
      ).toThrow(/HTTPS/);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
