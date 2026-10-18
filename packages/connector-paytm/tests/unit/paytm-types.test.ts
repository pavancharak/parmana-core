import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  PAYTM_ALLOWED_REFUND_PARAMETERS,
  PAYTM_AUTHORIZATION_SIGNATURE_TTL_MS,
  PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
  canonicalPaytmAuthorizationString,
  deriveDeterministicPaytmRefId,
  isPaytmAgentRefundExecutionResult,
  isPaytmConnectorCredentialValue,
  redactPaytmConnectorSecret,
} from "../../src/PaytmTypes.js";

describe("isPaytmConnectorCredentialValue", () => {
  it("accepts a well-formed credential value", () => {
    expect(isPaytmConnectorCredentialValue({ sharedSecret: "s3cr3t" })).toBe(
      true,
    );
  });

  it.each([
    [undefined],
    [null],
    ["a string"],
    [{}],
    [{ sharedSecret: "" }],
    [{ sharedSecret: 123 }],
    [{ notSharedSecret: "s3cr3t" }],
  ])("rejects %j", (value) => {
    expect(isPaytmConnectorCredentialValue(value)).toBe(false);
  });
});

describe("redactPaytmConnectorSecret", () => {
  it("never returns a literal substring of the secret", () => {
    const secret = "super-secret-connector-value-0123456789";
    const redacted = redactPaytmConnectorSecret(secret);

    expect(redacted.startsWith("fp_")).toBe(true);
    expect(redacted).not.toContain(secret);
    expect(secret).not.toContain(redacted.slice(3));
  });

  it("is deterministic for the same input", () => {
    expect(redactPaytmConnectorSecret("abc")).toBe(
      redactPaytmConnectorSecret("abc"),
    );
  });

  it("differs for different inputs", () => {
    expect(redactPaytmConnectorSecret("abc")).not.toBe(
      redactPaytmConnectorSecret("xyz"),
    );
  });
});

describe("PAYTM_ALLOWED_REFUND_PARAMETERS", () => {
  it("is exactly the deny-by-default allowlist this connector forwards", () => {
    expect(PAYTM_ALLOWED_REFUND_PARAMETERS).toEqual([
      "orderId",
      "transactionId",
      "amount",
      "refundReason",
      "refundReference",
    ]);
  });
});

describe("deriveDeterministicPaytmRefId", () => {
  it("is deterministic for the same (orderId, transactionId) pair", () => {
    expect(deriveDeterministicPaytmRefId("order-1", "txn-1")).toBe(
      deriveDeterministicPaytmRefId("order-1", "txn-1"),
    );
  });

  it("differs for a different orderId or transactionId", () => {
    const base = deriveDeterministicPaytmRefId("order-1", "txn-1");
    expect(deriveDeterministicPaytmRefId("order-2", "txn-1")).not.toBe(base);
    expect(deriveDeterministicPaytmRefId("order-1", "txn-2")).not.toBe(base);
  });

  it("is independent of any Parmana businessTransactionId (only orderId/transactionId matter)", () => {
    // Two distinct authorization attempts for the same logical refund
    // must derive the same refId regardless of businessTransactionId.
    const a = deriveDeterministicPaytmRefId("order-9", "txn-9");
    const b = deriveDeterministicPaytmRefId("order-9", "txn-9");
    expect(a).toBe(b);
  });

  it("G-71: with a refundReference, separate refunds of one transaction get separate refIds, and one refund keeps one", () => {
    const first = deriveDeterministicPaytmRefId("order-1", "txn-1", "REF-A");
    expect(deriveDeterministicPaytmRefId("order-1", "txn-1", "REF-A")).toBe(
      first,
    );
    expect(deriveDeterministicPaytmRefId("order-1", "txn-1", "REF-B")).not.toBe(
      first,
    );
    expect(first).not.toBe(deriveDeterministicPaytmRefId("order-1", "txn-1"));
    expect(first).toMatch(/^refid_[0-9a-f]{24}$/);
  });

  it("G-71: without a refundReference the refId is exactly what it was before the change", () => {
    // Pinned so a refund retried across the change keeps its refId.
    expect(deriveDeterministicPaytmRefId("order-1", "txn-1")).toBe(
      "refid_" +
        createHash("sha256").update("order-1:txn-1").digest("hex").slice(0, 24),
    );
  });

  it("G-71: a ':' inside an id cannot make two different triples collide", () => {
    expect(deriveDeterministicPaytmRefId("a:b", "c", "d")).not.toBe(
      deriveDeterministicPaytmRefId("a", "b:c", "d"),
    );
  });

  it("never uses randomness or wall-clock time (called twice in the same process yields the same value)", () => {
    const first = deriveDeterministicPaytmRefId("order-x", "txn-x");
    const second = deriveDeterministicPaytmRefId("order-x", "txn-x");
    expect(first).toBe(second);
  });
});

describe("isPaytmAgentRefundExecutionResult", () => {
  const valid = {
    businessTransactionId: "btx-1",
    action: "paytm-refund",
    target: "paytm://orders/order-1",
    parameters: {
      orderId: "order-1",
      txnId: "txn-1",
      refId: "refid_abc123",
      amount: "500.00",
    },
    success: true,
    executedAt: new Date().toISOString(),
    metadata: { provider: "paytm", resultStatus: "S", resultCode: "00" },
  };

  it("accepts a well-formed result", () => {
    expect(isPaytmAgentRefundExecutionResult(valid)).toBe(true);
  });

  it("accepts success: false with metadata describing why", () => {
    expect(
      isPaytmAgentRefundExecutionResult({
        ...valid,
        success: false,
        metadata: {
          provider: "paytm",
          resultStatus: "TXN_FAILURE",
          resultCode: "227",
        },
      }),
    ).toBe(true);
  });

  it.each([
    [
      "missing businessTransactionId",
      { ...valid, businessTransactionId: undefined },
    ],
    ["missing action", { ...valid, action: undefined }],
    ["missing target", { ...valid, target: undefined }],
    ["missing parameters", { ...valid, parameters: undefined }],
    [
      "missing parameters.orderId",
      { ...valid, parameters: { ...valid.parameters, orderId: undefined } },
    ],
    [
      "missing parameters.txnId",
      { ...valid, parameters: { ...valid.parameters, txnId: undefined } },
    ],
    [
      "missing parameters.refId",
      { ...valid, parameters: { ...valid.parameters, refId: undefined } },
    ],
    [
      "empty parameters.refId",
      { ...valid, parameters: { ...valid.parameters, refId: "" } },
    ],
    [
      "missing parameters.amount",
      { ...valid, parameters: { ...valid.parameters, amount: undefined } },
    ],
    ["non-boolean success", { ...valid, success: "true" }],
    ["missing executedAt", { ...valid, executedAt: undefined }],
    ["null", null],
    ["a string", "not an object"],
  ])("rejects %s", (_label, value) => {
    expect(isPaytmAgentRefundExecutionResult(value)).toBe(false);
  });
});

describe("PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET", () => {
  it("is a fixed, obviously-fake placeholder, not empty", () => {
    expect(PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET.length).toBeGreaterThan(
      0,
    );
    expect(PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET).toContain(
      "placeholder",
    );
  });
});

/**
 * canonicalPaytmAuthorizationString is a cross-repo contract (ADR-0009
 * Phase 2B): GatewayPaytmAdapter (this repo) and parmana-paytm-agent
 * (a separate repository) must each build byte-for-byte the same
 * string from the same inputs, or every signature this codebase
 * produces fails verification on the receiving side. These are
 * regression tests against silent format drift, not behavior this
 * codebase is free to change without a coordinated update on the
 * other side.
 */
describe("canonicalPaytmAuthorizationString", () => {
  const BASE_INPUT = {
    businessTransactionId: "btx-1",
    action: "paytm-refund",
    orderId: "order-1",
    txnId: "txn-1",
    amount: "500.00",
    expiresAt: 1_700_000_000_000,
  };

  it("produces a fixed, pipe-delimited format in a fixed field order", () => {
    expect(canonicalPaytmAuthorizationString(BASE_INPUT)).toBe(
      "btx-1|paytm-refund|order-1|txn-1|500.00|1700000000000",
    );
  });

  it("is a pure function: identical input always produces identical output", () => {
    expect(canonicalPaytmAuthorizationString(BASE_INPUT)).toBe(
      canonicalPaytmAuthorizationString({ ...BASE_INPUT }),
    );
  });

  it("changing any single field changes the resulting string (no field is ignored)", () => {
    const base = canonicalPaytmAuthorizationString(BASE_INPUT);

    for (const key of Object.keys(BASE_INPUT) as (keyof typeof BASE_INPUT)[]) {
      const mutated =
        key === "expiresAt"
          ? { ...BASE_INPUT, [key]: BASE_INPUT.expiresAt + 1 }
          : { ...BASE_INPUT, [key]: `${BASE_INPUT[key]}-different` };

      expect(canonicalPaytmAuthorizationString(mutated)).not.toBe(base);
    }
  });
});

describe("PAYTM_AUTHORIZATION_SIGNATURE_TTL_MS", () => {
  it("is a short, positive TTL (bounds replay of a captured signed request)", () => {
    expect(PAYTM_AUTHORIZATION_SIGNATURE_TTL_MS).toBeGreaterThan(0);
    expect(PAYTM_AUTHORIZATION_SIGNATURE_TTL_MS).toBeLessThanOrEqual(
      5 * 60_000,
    );
  });
});
