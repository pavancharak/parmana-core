/**
 * Parmana TypeScript SDK
 *
 * Unit tests for RefusalApi (RFC-0021): POST /refusal/verify and GET
 * /refusal/:businessTransactionId, previously uncovered by this SDK.
 * Each test proves the method sends the right method/path/body against
 * a minimal fake Transport, mirroring NewApiMethods.test.ts's pattern.
 */

import { describe, expect, it } from "vitest";

import type {
  Transport,
  TransportRequest,
  TransportResponse,
} from "../src/config/Transport.js";

import { RefusalApi } from "../src/client/RefusalApi.js";
import { ParmanaClient } from "../src/client/ParmanaClient.js";
import type { RefusalRecord } from "../src/models/index.js";

class FakeTransport implements Transport {
  public lastRequest: TransportRequest | undefined;

  constructor(private readonly body: unknown) {}

  async send<T>(request: TransportRequest): Promise<TransportResponse<T>> {
    this.lastRequest = request;
    return { status: 200, headers: {}, body: this.body as T };
  }
}

const record = {
  refusalRecordId: "refusal-1",
  businessTransactionId: "tx-1",
  decision: {
    decisionId: "decision-1",
    intentId: "intent-1",
    policy: { name: "vendor-payment", version: "2.0.0" },
    signals: { riskScore: 999 },
    outcome: "REJECTED",
    reason: "Risk exceeds maximum permitted threshold.",
    evaluatedAt: "2026-01-01T00:00:00.000Z",
  },
  evaluatedIntent: { target: "vendor/V-1", parameters: { amount: 4500 } },
  refusalRecordHash: "hash",
  signature: {
    algorithm: "ed25519",
    keyId: "default",
    value: "c2ln",
    signedAt: "2026-01-01T00:00:00.000Z",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
} as unknown as RefusalRecord;

describe("RefusalApi.verify", () => {
  it("sends POST /refusal/verify with the record as the body", async () => {
    const transport = new FakeTransport({ valid: true });

    const result = await new RefusalApi(transport).verify(record);

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe("/refusal/verify");
    expect(transport.lastRequest?.body).toBe(record);
    expect(result).toBe(true);
  });

  it("returns false, not just a truthy body, when the server reports an invalid signature", async () => {
    const transport = new FakeTransport({ valid: false });

    const result = await new RefusalApi(transport).verify(record);

    expect(result).toBe(false);
  });
});

describe("RefusalApi.get", () => {
  it("sends GET /refusal/:businessTransactionId", async () => {
    const transport = new FakeTransport(record);

    const result = await new RefusalApi(transport).get("tx-1");

    expect(transport.lastRequest?.method).toBe("GET");
    expect(transport.lastRequest?.path).toBe("/refusal/tx-1");
    expect(result).toEqual(record);
  });
});

describe("ParmanaClient wiring", () => {
  it("client.refusalRecord() delegates to RefusalApi.get()", async () => {
    const transport = new FakeTransport(record);
    const client = new ParmanaClient({
      endpoint: "http://localhost:3000",
      transport,
    });

    await client.refusalRecord("tx-1");

    expect(transport.lastRequest?.method).toBe("GET");
    expect(transport.lastRequest?.path).toBe("/refusal/tx-1");
  });

  it("client.verifyRefusalRecord() delegates to RefusalApi.verify()", async () => {
    const transport = new FakeTransport({ valid: true });
    const client = new ParmanaClient({
      endpoint: "http://localhost:3000",
      transport,
    });

    const result = await client.verifyRefusalRecord(record);

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe("/refusal/verify");
    expect(result).toBe(true);
  });
});
