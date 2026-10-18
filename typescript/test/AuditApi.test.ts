/**
 * Parmana TypeScript SDK
 *
 * Unit tests for AuditApi: POST /audit/verify, previously uncovered by
 * this SDK. Each test proves the method sends the right method/path/body
 * against a minimal fake Transport, mirroring NewApiMethods.test.ts's
 * pattern.
 */

import { describe, expect, it } from "vitest";

import type {
  Transport,
  TransportRequest,
  TransportResponse,
} from "../src/config/Transport.js";

import { AuditApi } from "../src/client/AuditApi.js";
import { ParmanaClient } from "../src/client/ParmanaClient.js";
import type { AuditEvent, Signature } from "../src/models/index.js";

class FakeTransport implements Transport {
  public lastRequest: TransportRequest | undefined;

  constructor(private readonly body: unknown) {}

  async send<T>(request: TransportRequest): Promise<TransportResponse<T>> {
    this.lastRequest = request;
    return { status: 200, headers: {}, body: this.body as T };
  }
}

const event: AuditEvent = {
  type: "caller.authenticated",
  occurredAt: "2026-01-01T00:00:00.000Z",
  route: "/execute",
  callerId: "caller-1",
};

const signature = {
  algorithm: "ed25519",
  keyId: "default",
  value: "c2ln",
  signedAt: "2026-01-01T00:00:00.000Z",
} as unknown as Signature;

describe("AuditApi.verify", () => {
  it("sends POST /audit/verify with { event, signature } as the body", async () => {
    const transport = new FakeTransport({ valid: true });

    const result = await new AuditApi(transport).verify(event, signature);

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe("/audit/verify");
    expect(transport.lastRequest?.body).toEqual({ event, signature });
    expect(result).toBe(true);
  });

  it("returns false, not just a truthy body, when the server reports an invalid signature", async () => {
    const transport = new FakeTransport({ valid: false });

    const result = await new AuditApi(transport).verify(event, signature);

    expect(result).toBe(false);
  });
});

describe("ParmanaClient wiring", () => {
  it("client.verifyAuditEvent() delegates to AuditApi.verify()", async () => {
    const transport = new FakeTransport({ valid: true });
    const client = new ParmanaClient({
      endpoint: "http://localhost:3000",
      transport,
    });

    const result = await client.verifyAuditEvent(event, signature);

    expect(transport.lastRequest?.method).toBe("POST");
    expect(transport.lastRequest?.path).toBe("/audit/verify");
    expect(result).toBe(true);
  });
});
