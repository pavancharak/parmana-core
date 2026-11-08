import { describe, expect, it } from "vitest";

import type { BusinessSignalQuery } from "../../src/business-validation/BusinessSignalSource.js";
import { createRazorpayPaymentSource } from "../../src/business-validation/razorpay-payment-source.js";

/**
 * The Razorpay payment source establishes "payment.refundable" from Razorpay's own record, and reports it
 * as an observed value that expires in 60 seconds. A missing payment is not_found; a failed read throws.
 */

const CREDENTIAL = "rzp_test_keyid:super-secret-value";
const NOW = new Date("2026-11-08T10:00:00.000Z");
const PAYMENT = "pay_TestPayment01";

function query(
  overrides: Partial<BusinessSignalQuery> = {},
): BusinessSignalQuery {
  return {
    signalKey: "payment.refundable",
    claim: "payment.refundable",
    subject: PAYMENT,
    subjectPath: "parameters.paymentId",
    action: "razorpay:refund",
    businessTransactionId: "bt-7",
    parameters: { amount: 1000 },
    ...overrides,
  };
}

function razorpay(body: Record<string, unknown>, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

function source(fetch: typeof globalThis.fetch) {
  return createRazorpayPaymentSource({
    credential: CREDENTIAL,
    fetch,
    now: () => NOW,
  });
}

const captured = {
  status: "captured",
  amount: 1000,
  amount_refunded: 0,
  refund_status: null,
};

describe("Razorpay payment source (payment.refundable)", () => {
  it("reports true for a captured payment with the amount still refundable, valid for 60 seconds", async () => {
    const { fetch, calls } = razorpay(captured);
    const answer = await source(fetch).resolve(query());

    expect(answer).toEqual({
      kind: "observed",
      value: true,
      sourceIdentity: "razorpay:payments",
      observedAt: NOW,
      validUntil: new Date("2026-11-08T10:01:00.000Z"),
    });
    expect(calls[0]?.url).toBe(
      `https://api.razorpay.com/v1/payments/${PAYMENT}`,
    );
    expect(calls[0]?.init.redirect).toBe("error");
  });

  it("reports false when the payment is not captured", async () => {
    const { fetch } = razorpay({ ...captured, status: "authorized" });
    expect(await source(fetch).resolve(query())).toMatchObject({
      kind: "observed",
      value: false,
    });
  });

  it("reports false when the payment is fully refunded, even if its status is captured", async () => {
    const { fetch } = razorpay({
      ...captured,
      amount_refunded: 1000,
      refund_status: "full",
    });
    expect(await source(fetch).resolve(query())).toMatchObject({
      kind: "observed",
      value: false,
    });
  });

  it("reports false when less than the requested amount remains", async () => {
    const { fetch } = razorpay({
      ...captured,
      amount_refunded: 600,
      refund_status: "partial",
    });
    expect(
      await source(fetch).resolve(query({ parameters: { amount: 500 } })),
    ).toMatchObject({ value: false });
    expect(
      await source(fetch).resolve(query({ parameters: { amount: 400 } })),
    ).toMatchObject({ value: true });
  });

  it("reports not_found for a payment Razorpay does not have", async () => {
    const { fetch } = razorpay({ error: { code: "BAD_REQUEST_ERROR" } }, 404);
    expect(await source(fetch).resolve(query())).toEqual({
      kind: "not_found",
      reason: "Razorpay has no payment with this id",
    });
  });

  it("reports not_found for a subject that is not a Razorpay payment id, without calling Razorpay", async () => {
    const { fetch, calls } = razorpay(captured);
    expect(await source(fetch).resolve(query({ subject: "ORD-1001" }))).toEqual(
      {
        kind: "not_found",
        reason: "the subject is not a Razorpay payment id",
      },
    );
    expect(calls).toHaveLength(0);
  });

  it("throws when Razorpay fails, and never includes the credential in the error", async () => {
    const { fetch } = razorpay({ error: { description: "server error" } }, 500);
    const failure = await source(fetch)
      .resolve(query())
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Razorpay answered HTTP 500 for the payment read",
    );
    expect((failure as Error).message).not.toContain("super-secret-value");
  });

  it("throws when the read is missing a field the check needs", async () => {
    const { fetch } = razorpay({ status: "captured", amount: 1000 });
    await expect(source(fetch).resolve(query())).rejects.toThrow(
      "missing status, amount or amount_refunded",
    );
  });

  it("throws for a claim it does not establish, since that is a configuration error", async () => {
    const { fetch, calls } = razorpay(captured);
    await expect(
      source(fetch).resolve(query({ claim: "invoice.paid" })),
    ).rejects.toThrow('does not establish the claim "invoice.paid"');
    expect(calls).toHaveLength(0);
  });

  it("throws when the refund amount is missing or not a positive whole number of paise", async () => {
    const { fetch, calls } = razorpay(captured);
    await expect(
      source(fetch).resolve(query({ parameters: {} })),
    ).rejects.toThrow("positive whole number of paise");
    await expect(
      source(fetch).resolve(query({ parameters: { amount: 10.5 } })),
    ).rejects.toThrow("positive whole number");
    expect(calls).toHaveLength(0);
  });

  it("refuses to be built without a key id and secret", () => {
    expect(() => createRazorpayPaymentSource({ credential: "" })).toThrow(
      "needs a key id and key secret",
    );
    expect(() =>
      createRazorpayPaymentSource({ credential: "no-colon" }),
    ).toThrow("needs a key id and key secret");
  });
});
