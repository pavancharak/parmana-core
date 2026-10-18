/**
 * Parmana TypeScript SDK
 *
 * Unit tests for the three real API capabilities added during the SDK
 * audit that previously had zero SDK coverage:
 * - GET /version (ExecutionApi.version / ParmanaClient.version)
 * - POST /verify (VerificationApi.verify / ParmanaClient.verify)
 * - POST /transactions (TransactionApi.create / ParmanaClient.createTransaction)
 *
 * Each test proves the method sends the right method/path/body against
 * a minimal fake Transport, mirroring the fixture pattern already used
 * by the Python SDK's FakeTransport tests.
 */

import { describe, expect, it } from "vitest";

import type {
  Transport,
  TransportRequest,
  TransportResponse,
} from "../src/config/Transport.js";

import { ExecutionApi } from "../src/client/ExecutionApi.js";
import { VerificationApi } from "../src/client/VerificationApi.js";
import { TransactionApi } from "../src/client/TransactionApi.js";
import { ParmanaClient } from "../src/client/ParmanaClient.js";
import { HttpTransport } from "../src/transport/HttpTransport.js";

class FakeTransport implements Transport {
  public lastRequest: TransportRequest | undefined;

  constructor(private readonly body: unknown) {}

  async send<T>(request: TransportRequest): Promise<TransportResponse<T>> {
    this.lastRequest = request;
    return { status: 200, headers: {}, body: this.body as T };
  }
}

describe("ExecutionApi.version", () => {
  it("sends GET /version", async () => {
    const transport = new FakeTransport({
      name: "Parmana",
      version: "0.4.0",
      api: "v1",
    });

    const result = await new ExecutionApi(transport).version();

    expect(transport.lastRequest?.method).toBe("GET");
    expect(transport.lastRequest?.path).toBe("/version");
    expect(result).toEqual({ name: "Parmana", version: "0.4.0", api: "v1" });
  });
});

describe("VerificationApi.verify", () => {
  it("sends POST /verify with businessTransactionId in the body", async () => {
    const transport = new FakeTransport({
      verificationId: "v-1",
      businessTransactionId: "tx-1",
      status: "VERIFIED",
      verifiedAt: "2026-01-01T00:00:00.000Z",
      trustRecordHash: "hash",
    });

    const result = await new VerificationApi(transport).verify("tx-1");

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe("/verify");
    expect(transport.lastRequest?.body).toEqual({
      businessTransactionId: "tx-1",
    });
    expect(result.status).toBe("VERIFIED");
  });

  it("remains distinct from getLatest (GET /verification/:id)", async () => {
    const transport = new FakeTransport({
      verificationId: "v-1",
      businessTransactionId: "tx-1",
      status: "VERIFIED",
      verifiedAt: "2026-01-01T00:00:00.000Z",
      trustRecordHash: "hash",
    });

    await new VerificationApi(transport).getLatest("tx-1");

    expect(transport.lastRequest?.method).toBe("GET");
    expect(transport.lastRequest?.path).toBe("/verification/tx-1");
  });
});

describe("TransactionApi.create", () => {
  it("sends POST /transactions with the transaction as the body", async () => {
    const transport = new FakeTransport({
      trustRecordId: "tr-1",
      businessTransactionId: "tx-1",
    });

    const transaction = { businessTransactionId: "tx-1" } as never;

    const result = await new TransactionApi(transport).create(transaction);

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe("/transactions");
    expect(transport.lastRequest?.body).toBe(transaction);
    expect(result).toEqual({
      trustRecordId: "tr-1",
      businessTransactionId: "tx-1",
    });
  });
});

describe("ParmanaClient wiring", () => {
  it("client.version() delegates to ExecutionApi.version()", async () => {
    const transport = new FakeTransport({ version: "0.4.0" });

    const client = new ParmanaClient({
      endpoint: "http://localhost:3000",
      transport,
    });

    await client.version();

    expect(transport.lastRequest?.path).toBe("/version");
  });

  it("client.verify() delegates to VerificationApi.verify()", async () => {
    const transport = new FakeTransport({ status: "VERIFIED" });

    const client = new ParmanaClient({
      endpoint: "http://localhost:3000",
      transport,
    });

    await client.verify("tx-1");

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe("/verify");
  });

  it("client.createTransaction() delegates to TransactionApi.create()", async () => {
    const transport = new FakeTransport({ trustRecordId: "tr-1" });

    const client = new ParmanaClient({
      endpoint: "http://localhost:3000",
      transport,
    });

    await client.createTransaction({ businessTransactionId: "tx-1" } as never);

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe("/transactions");
  });

  it("wires a real HttpTransport identically to a fake one (construction sanity check)", () => {
    const endpoint = "http://localhost:3000";
    const client = new ParmanaClient({
      endpoint,
      transport: new HttpTransport({ endpoint }),
    });

    expect(client.endpoint()).toBe(endpoint);
  });
});
