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

describe("policy version 2 replay", () => {
  it("reads the replay of a recorded decision", async () => {
    const response = {
      reproduced: true,
      differences: [],
      replayed: { outcome: "APPROVE", recordId: "rec_1" },
    };
    const { client, transport } = clientWith(response);

    expect(await client.policyV2Replay("rec_1")).toEqual(response);
    expect(transport.requests[0]).toEqual({
      method: "GET",
      path: "/v2/evidence/rec_1/replay",
    });
  });

  it("reports a replay that did not reproduce, with what differed", async () => {
    const { client } = clientWith({
      reproduced: false,
      differences: ["outcome changed from APPROVE to REJECT"],
    });

    const result = await client.policyV2Replay("rec_2");

    expect(result.reproduced).toBe(false);
    expect(result.differences).toHaveLength(1);
  });

  it("encodes the record id in the path", async () => {
    const { client, transport } = clientWith({
      reproduced: true,
      differences: [],
    });

    await client.policyV2Replay("a/b c");

    expect(transport.requests[0]?.path).toBe("/v2/evidence/a%2Fb%20c/replay");
  });
});
