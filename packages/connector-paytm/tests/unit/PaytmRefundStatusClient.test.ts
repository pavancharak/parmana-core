import { describe, expect, it, vi } from "vitest";

import { lookupPaytmRefundStatus } from "../../src/PaytmRefundStatusClient.js";

function fetchReturning(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

const OPTIONS = {
  baseUrl: "https://agent.example.com",
  sharedSecret: "secret-value",
};
const LOOKUP = { orderId: "ORD-1", refId: "refid_1" };

describe("lookupPaytmRefundStatus", () => {
  it("posts the order and refId to the status route with the shared secret, and returns Paytm's status", async () => {
    const fetch = fetchReturning(200, {
      provider: "paytm",
      resultStatus: "PENDING",
      resultCode: "601",
      resultMessage: "pending state",
    });

    const result = await lookupPaytmRefundStatus({ ...OPTIONS, fetch }, LOOKUP);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://agent.example.com/connector/paytm-refund-status");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer secret-value",
    });
    expect(JSON.parse(init.body as string)).toEqual(LOOKUP);
    expect(result).toEqual({
      provider: "paytm",
      resultStatus: "PENDING",
      resultCode: "601",
      resultMessage: "pending state",
    });
  });

  it("returns null code and message when the service omits them", async () => {
    const result = await lookupPaytmRefundStatus(
      {
        ...OPTIONS,
        fetch: fetchReturning(200, {
          provider: "paytm",
          resultStatus: "UNKNOWN",
        }),
      },
      LOOKUP,
    );

    expect(result).toEqual({
      provider: "paytm",
      resultStatus: "UNKNOWN",
      resultCode: null,
      resultMessage: null,
    });
  });

  it("throws on a non-OK response, without reporting any status", async () => {
    await expect(
      lookupPaytmRefundStatus(
        { ...OPTIONS, fetch: fetchReturning(503, { error: "down" }) },
        LOOKUP,
      ),
    ).rejects.toThrow("HTTP 503");
  });

  it("throws on a response that is not a Paytm status", async () => {
    await expect(
      lookupPaytmRefundStatus(
        { ...OPTIONS, fetch: fetchReturning(200, { resultStatus: "PENDING" }) },
        LOOKUP,
      ),
    ).rejects.toThrow("unexpected response");
  });

  it("refuses a non-local http endpoint before any request is sent", async () => {
    const fetch = fetchReturning(200, {});

    await expect(
      lookupPaytmRefundStatus(
        { baseUrl: "http://agent.example.com", sharedSecret: "s", fetch },
        LOOKUP,
      ),
    ).rejects.toThrow("requires an https endpoint");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows http only for localhost", async () => {
    const fetch = fetchReturning(200, { provider: "paytm", resultStatus: "S" });

    await lookupPaytmRefundStatus(
      { baseUrl: "http://localhost:3000", sharedSecret: "s", fetch },
      LOOKUP,
    );

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses a blank orderId or refId before any request is sent", async () => {
    const fetch = fetchReturning(200, {});

    await expect(
      lookupPaytmRefundStatus(
        { ...OPTIONS, fetch },
        { orderId: " ", refId: "refid_1" },
      ),
    ).rejects.toThrow("orderId and refId are required");
    expect(fetch).not.toHaveBeenCalled();
  });
});
