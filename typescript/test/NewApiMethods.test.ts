/**
 * Parmana TypeScript SDK
 *
 * Unit tests for the three real API capabilities added during the SDK
 * audit that previously had zero SDK coverage:
 * - GET /version (ExecutionApi.version / ParmanaClient.version)
 * - POST /verify (VerificationApi.verify / ParmanaClient.verify)
 * - POST /transactions (TransactionApi.declare / ParmanaClient.declareTransaction)
 * - POST /transactions/{id}/execute (TransactionApi.execute / ParmanaClient.executeTransaction)
 * - GET /transactions/{id}/status (TransactionApi.status / ParmanaClient.transactionStatus)
 * - POST /transactions/{id}/reconcile (TransactionApi.reconcile / ParmanaClient.reconcileTransaction)
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
import { ExecutionPendingError } from "../src/errors/ExecutionPendingError.js";
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

describe("TransactionApi.declare", () => {
  it("sends POST /transactions with the transaction as the body", async () => {
    const declared = {
      businessTransactionId: "tx-1",
      status: "RECEIVED",
      transaction: {},
    };
    const transport = new FakeTransport(declared);

    const transaction = { businessTransactionId: "tx-1" } as never;

    const result = await new TransactionApi(transport).declare(transaction);

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe("/transactions");
    expect(transport.lastRequest?.body).toBe(transaction);
    expect(result).toEqual(declared);
  });
});

describe("TransactionApi.execute", () => {
  it("sends POST /transactions/{id}/execute with no body", async () => {
    const transport = new FakeTransport({ trustRecordId: "tr-1" });

    await new TransactionApi(transport).execute("tx-1");

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe("/transactions/tx-1/execute");
    expect(transport.lastRequest?.body).toBeUndefined();
  });
});

class StatusFake implements Transport {
  public lastRequest: TransportRequest | undefined;

  constructor(
    private readonly status: number,
    private readonly body: unknown,
  ) {}

  async send<T>(request: TransportRequest): Promise<TransportResponse<T>> {
    this.lastRequest = request;
    return { status: this.status, headers: {}, body: this.body as T };
  }
}

describe("TransactionApi.execute: the 202 pending answer", () => {
  const pending = {
    businessTransactionId: "tx-1",
    status: "EXECUTING",
    outcome: "pending",
    reconcile: "/transactions/tx-1/reconcile",
    record: { trustRecordId: "tr-1", businessTransactionId: "tx-1" },
  };

  it("asks for 202 as a non-throwing status, so the body reaches the SDK", async () => {
    const transport = new StatusFake(200, { trustRecordId: "tr-1" });

    await new TransactionApi(transport).execute("tx-1");

    expect(transport.lastRequest?.nonThrowingStatuses).toEqual([202]);
  });

  it("throws ExecutionPendingError on 202, carrying the record and the reconcile path", async () => {
    const transport = new StatusFake(202, pending);

    const error = await new TransactionApi(transport)
      .execute("tx-1")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExecutionPendingError);
    const typed = error as ExecutionPendingError;
    expect(typed.code).toBe("EXECUTION_STATUS_PENDING");
    expect(typed.businessTransactionId).toBe("tx-1");
    expect(typed.record).toEqual(pending.record);
    expect(typed.reconcilePath).toBe("/transactions/tx-1/reconcile");
  });

  it("returns the record normally on 200", async () => {
    const record = { trustRecordId: "tr-1" };
    const result = await new TransactionApi(
      new StatusFake(200, record),
    ).execute("tx-1");

    expect(result).toEqual(record);
  });
});

describe("ExecutionApi.execute: the 202 pending answer", () => {
  it("throws ExecutionPendingError on 202 from the one-call route, with the record", async () => {
    const pending = {
      businessTransactionId: "tx-2",
      status: "EXECUTING",
      outcome: "pending",
      reconcile: "/transactions/tx-2/reconcile",
      record: { trustRecordId: "tr-2", businessTransactionId: "tx-2" },
    };
    const transport = new StatusFake(202, pending);

    const error = await new ExecutionApi(transport)
      .execute({ businessTransactionId: "tx-2" } as never)
      .catch((e: unknown) => e);

    expect(transport.lastRequest?.nonThrowingStatuses).toEqual([202]);
    expect(error).toBeInstanceOf(ExecutionPendingError);
    expect((error as ExecutionPendingError).record).toEqual(pending.record);
  });
});

describe("TransactionApi.create", () => {
  it("declares and then executes: POST /transactions, then POST /transactions/{id}/execute", async () => {
    const transport = new FakeTransport({
      trustRecordId: "tr-1",
      businessTransactionId: "tx-1",
    });

    const transaction = { businessTransactionId: "tx-1" } as never;

    const result = await new TransactionApi(transport).create(transaction);

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe("/transactions/tx-1/execute");
    expect(result).toEqual({
      trustRecordId: "tr-1",
      businessTransactionId: "tx-1",
    });
  });
});

describe("TransactionApi.status and reconcile", () => {
  it("sends GET /transactions/{id}/status, with ?history=true when history is asked for", async () => {
    const transport = new FakeTransport({ businessTransactionId: "tx-1" });
    const api = new TransactionApi(transport);

    await api.status("tx-1");
    expect(transport.lastRequest?.method).toBe("GET");
    expect(transport.lastRequest?.path).toBe("/transactions/tx-1/status");

    await api.status("tx-1", { history: true });
    expect(transport.lastRequest?.path).toBe(
      "/transactions/tx-1/status?history=true",
    );
  });

  it("sends POST /transactions/{id}/reconcile", async () => {
    const transport = new FakeTransport({
      businessTransactionId: "tx-1",
      changed: false,
      status: "VERIFIED",
    });

    const result = await new TransactionApi(transport).reconcile("tx-1");

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe("/transactions/tx-1/reconcile");
    expect(result).toEqual({
      businessTransactionId: "tx-1",
      changed: false,
      status: "VERIFIED",
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

  it("client.createTransaction() delegates to TransactionApi.create(): declare, then execute", async () => {
    const transport = new FakeTransport({
      trustRecordId: "tr-1",
      businessTransactionId: "tx-1",
    });

    const client = new ParmanaClient({
      endpoint: "http://localhost:3000",
      transport,
    });

    await client.createTransaction({ businessTransactionId: "tx-1" } as never);

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe("/transactions/tx-1/execute");
  });

  it("client.declareTransaction(), executeTransaction(), transactionStatus() and reconcileTransaction() reach their routes", async () => {
    const transport = new FakeTransport({ businessTransactionId: "tx-1" });
    const client = new ParmanaClient({
      endpoint: "http://localhost:3000",
      transport,
    });

    await client.declareTransaction({ businessTransactionId: "tx-1" } as never);
    expect(transport.lastRequest?.path).toBe("/transactions");

    await client.executeTransaction("tx-1");
    expect(transport.lastRequest?.path).toBe("/transactions/tx-1/execute");

    await client.transactionStatus("tx-1", { history: true });
    expect(transport.lastRequest?.path).toBe(
      "/transactions/tx-1/status?history=true",
    );

    await client.reconcileTransaction("tx-1");
    expect(transport.lastRequest?.path).toBe("/transactions/tx-1/reconcile");
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
