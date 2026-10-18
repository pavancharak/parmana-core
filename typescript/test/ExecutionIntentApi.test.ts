/**
 * Parmana TypeScript SDK
 *
 * Unit tests for ExecutionIntentApi (ADR-0012, G-55): the five Execution Intent
 * routes. Each test proves the method sends the right method, path and body
 * against a minimal fake Transport, and that ParmanaClient delegates to it,
 * mirroring RefusalApi.test.ts.
 */

import { describe, expect, it } from "vitest";

import type {
  Transport,
  TransportRequest,
  TransportResponse,
} from "../src/config/Transport.js";

import { ExecutionIntentApi } from "../src/client/ExecutionIntentApi.js";
import { ParmanaClient } from "../src/client/ParmanaClient.js";
import type {
  ExecutionIntent,
  ExecutionIntentView,
} from "../src/models/index.js";

class FakeTransport implements Transport {
  public lastRequest: TransportRequest | undefined;

  constructor(private readonly body: unknown) {}

  async send<T>(request: TransportRequest): Promise<TransportResponse<T>> {
    this.lastRequest = request;
    return { status: 200, headers: {}, body: this.body as T };
  }
}

const intent = {
  intentId: "intent-1",
  businessTransactionId: "tx-1",
  decisionId: "decision-1",
  authorizationId: "authorization-1",
  policyName: "customer-refund",
  policyVersion: "1.0.0",
  businessTransactionHash: "hash",
  action: "paytm:refund",
  target: "order-1",
  createdAt: "2026-09-21T00:00:00.000Z",
  intentHash: "intent-hash",
  signature: {
    algorithm: "ed25519",
    keyId: "default",
    value: "c2ln",
    signedAt: "2026-09-21T00:00:00.000Z",
  },
} as unknown as ExecutionIntent;

const view = {
  intent,
  status: { state: "FINALIZED", finalizationMode: "INLINE" },
} as unknown as ExecutionIntentView;

function client(transport: Transport): ParmanaClient {
  return new ParmanaClient({ endpoint: "http://localhost:3000", transport });
}

describe("ExecutionIntentApi.verify", () => {
  it("sends POST /execution-intents/verify with the intent as the body", async () => {
    const transport = new FakeTransport({ valid: true });

    const result = await new ExecutionIntentApi(transport).verify(intent);

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe("/execution-intents/verify");
    expect(transport.lastRequest?.body).toBe(intent);
    expect(result).toBe(true);
  });

  it("returns false, not just a truthy body, when the signature is invalid", async () => {
    const transport = new FakeTransport({ valid: false });

    expect(await new ExecutionIntentApi(transport).verify(intent)).toBe(false);
  });
});

describe("ExecutionIntentApi.get", () => {
  it("sends GET /execution-intents/:businessTransactionId", async () => {
    const transport = new FakeTransport(view);

    const result = await new ExecutionIntentApi(transport).get("tx-1");

    expect(transport.lastRequest?.method).toBe("GET");
    expect(transport.lastRequest?.path).toBe("/execution-intents/tx-1");
    expect(result).toEqual(view);
  });

  it("encodes an id that contains characters that are not safe in a path", async () => {
    const transport = new FakeTransport(view);

    await new ExecutionIntentApi(transport).get("a/b c");

    expect(transport.lastRequest?.path).toBe("/execution-intents/a%2Fb%20c");
  });
});

describe("ExecutionIntentApi.listUnfinalized", () => {
  it("sends GET /execution-intents/unfinalized with no limit by default", async () => {
    const transport = new FakeTransport({ intents: [view] });

    const result = await new ExecutionIntentApi(transport).listUnfinalized();

    expect(transport.lastRequest?.method).toBe("GET");
    expect(transport.lastRequest?.path).toBe("/execution-intents/unfinalized");
    expect(result.intents).toHaveLength(1);
  });

  it("passes a limit as a query parameter", async () => {
    const transport = new FakeTransport({ intents: [] });

    await new ExecutionIntentApi(transport).listUnfinalized(25);

    expect(transport.lastRequest?.path).toBe(
      "/execution-intents/unfinalized?limit=25",
    );
  });
});

describe("ExecutionIntentApi.finalize", () => {
  it("sends POST /execution-intents/:id/finalize and returns the outcome", async () => {
    const body = {
      outcome: "FINALIZED",
      businessTransactionId: "tx-1",
      trustRecordId: "record-1",
      trustRecord: {},
    };
    const transport = new FakeTransport(body);

    const result = await new ExecutionIntentApi(transport).finalize("tx-1");

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe(
      "/execution-intents/tx-1/finalize",
    );
    expect(transport.lastRequest?.body).toBeUndefined();
    expect(result.outcome).toBe("FINALIZED");
    expect(result.trustRecordId).toBe("record-1");
  });
});

describe("ExecutionIntentApi.resolve", () => {
  it("sends POST /execution-intents/:id/resolve with the resolution and the note", async () => {
    const body = {
      outcome: "RESOLVED",
      businessTransactionId: "tx-1",
      ...view,
    };
    const transport = new FakeTransport(body);
    const input = {
      resolution: "NOT_EXECUTED",
      note: "Checked the connector.",
    } as const;

    const result = await new ExecutionIntentApi(transport).resolve(
      "tx-1",
      input,
    );

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe("/execution-intents/tx-1/resolve");
    expect(transport.lastRequest?.body).toEqual(input);
    expect(result.outcome).toBe("RESOLVED");
  });
});

describe("ParmanaClient wiring for Execution Intents", () => {
  it("executionIntent() delegates to GET /execution-intents/:id", async () => {
    const transport = new FakeTransport(view);

    await client(transport).executionIntent("tx-1");

    expect(transport.lastRequest?.method).toBe("GET");
    expect(transport.lastRequest?.path).toBe("/execution-intents/tx-1");
  });

  it("verifyExecutionIntent() delegates to POST /execution-intents/verify", async () => {
    const transport = new FakeTransport({ valid: true });

    const result = await client(transport).verifyExecutionIntent(intent);

    expect(transport.lastRequest?.path).toBe("/execution-intents/verify");
    expect(result).toBe(true);
  });

  it("unfinalizedExecutionIntents() passes the limit through", async () => {
    const transport = new FakeTransport({ intents: [] });

    await client(transport).unfinalizedExecutionIntents(10);

    expect(transport.lastRequest?.path).toBe(
      "/execution-intents/unfinalized?limit=10",
    );
  });

  it("finalizeExecutionIntent() delegates to POST .../finalize", async () => {
    const transport = new FakeTransport({ outcome: "ALREADY_FINALIZED" });

    await client(transport).finalizeExecutionIntent("tx-1");

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe(
      "/execution-intents/tx-1/finalize",
    );
  });

  it("resolveExecutionIntent() delegates to POST .../resolve with the body", async () => {
    const transport = new FakeTransport({ outcome: "RESOLVED" });

    await client(transport).resolveExecutionIntent("tx-1", {
      resolution: "EXECUTED",
      note: "It ran.",
    });

    expect(transport.lastRequest?.path).toBe("/execution-intents/tx-1/resolve");
    expect(transport.lastRequest?.body).toEqual({
      resolution: "EXECUTED",
      note: "It ran.",
    });
  });
});
