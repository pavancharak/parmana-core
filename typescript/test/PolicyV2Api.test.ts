import { describe, expect, it } from "vitest";

import type {
  Transport,
  TransportRequest,
  TransportResponse,
} from "../src/config/Transport.js";
import { ParmanaClient } from "../src/client/ParmanaClient.js";

class FakeTransport implements Transport {
  public readonly requests: TransportRequest[] = [];

  constructor(private readonly body: unknown = {}) {}

  async send<T>(request: TransportRequest): Promise<TransportResponse<T>> {
    this.requests.push(request);
    return { status: 200, headers: {}, body: this.body as T };
  }
}

function clientWith(body: unknown) {
  const transport = new FakeTransport(body);
  const client = new ParmanaClient({
    endpoint: "http://127.0.0.1:3000",
    transport,
  });
  return { client, transport };
}

describe("policy version 2 decisions", () => {
  it("posts a decision request and returns the recorded outcome", async () => {
    const response = {
      outcome: "REVIEW",
      reason: "Above the approval threshold.",
      tier: "review",
      recordId: "rec_1",
      released: false,
      reviewId: "item_1",
    };
    const { client, transport } = clientWith(response);

    const request = {
      capability: "erp:pay-invoice",
      transactionId: "txn_1",
      target: "erp",
      parameters: { amount: 100 },
      signals: { vendor: "acme" },
    };

    expect(await client.decidePolicyV2(request)).toEqual(response);
    expect(transport.requests[0]).toEqual({
      method: "POST",
      path: "/v2/decisions",
      body: request,
    });
  });

  it("returns a refusal without releasing anything", async () => {
    const response = {
      outcome: "REJECT",
      reason: "No approved policy.",
      refusal: { code: "NO_APPROVED_POLICY", detail: "erp:pay-invoice" },
      recordId: "rec_2",
      released: false,
    };
    const { client } = clientWith(response);

    const result = await client.decidePolicyV2({
      capability: "erp:pay-invoice",
      transactionId: "txn_2",
      target: "erp",
    });

    expect(result.released).toBe(false);
    expect(result.refusal?.code).toBe("NO_APPROVED_POLICY");
  });
});

describe("policy version 2 reviews", () => {
  it("reads the status of a review item for its requester", async () => {
    const { client, transport } = clientWith({
      status: "pending",
      reasonCode: "UNDER_REVIEW",
    });

    expect(await client.policyV2Review("item_1")).toEqual({
      status: "pending",
      reasonCode: "UNDER_REVIEW",
    });
    expect(transport.requests[0]).toEqual({
      method: "GET",
      path: "/v2/reviews/item_1",
    });
  });

  it("encodes the item id in the path", async () => {
    const { client, transport } = clientWith({
      status: "pending",
      reasonCode: "UNDER_REVIEW",
    });

    await client.policyV2Review("a/b c");

    expect(transport.requests[0]?.path).toBe("/v2/reviews/a%2Fb%20c");
  });

  it("records a reviewer's approval", async () => {
    const response = {
      itemId: "item_1",
      status: "approved",
      final: false,
      decisionsRecorded: 1,
    };
    const { client, transport } = clientWith(response);

    expect(await client.decidePolicyV2Review("item_1", "approve")).toEqual(
      response,
    );
    expect(transport.requests[0]).toEqual({
      method: "POST",
      path: "/v2/reviews/item_1/decision",
      body: { decision: "approve" },
    });
  });

  it("records a reviewer's rejection", async () => {
    const { client, transport } = clientWith({
      itemId: "item_1",
      status: "refused",
      final: true,
      outcome: "REFUSED",
      decisionsRecorded: 1,
    });

    await client.decidePolicyV2Review("item_1", "reject");

    expect(transport.requests[0]?.body).toEqual({ decision: "reject" });
  });
});
