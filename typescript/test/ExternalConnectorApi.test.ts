import { describe, expect, it } from "vitest";

import type {
  Transport,
  TransportRequest,
  TransportResponse,
} from "../src/config/Transport.js";
import { ParmanaClient } from "../src/client/ParmanaClient.js";
import type { PolicyChangeStepUpAuthorization } from "../src/index.js";

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

const stepUp = {
  payload: {},
  signature: "s",
  keyId: "k",
  algorithm: "ed25519",
} as unknown as PolicyChangeStepUpAuthorization;

describe("external connector changes", () => {
  it("lists the registrations", async () => {
    const { client, transport } = clientWith({
      connectors: [{ capability: "erp:create-invoice", status: "active" }],
    });

    expect(await client.externalConnectors()).toEqual([
      { capability: "erp:create-invoice", status: "active" },
    ]);
    expect(transport.requests[0]).toMatchObject({
      method: "GET",
      path: "/external-connectors",
    });
  });

  it("proposes a register and a revoke", async () => {
    const { client, transport } = clientWith({ changeId: "c-1" });

    await client.proposeExternalConnectorChange({
      action: "register",
      capability: "erp:create-invoice",
      endpointUrl: "https://erp.example.com/parmana/release",
      policy: "erp-invoice",
      allowedParameters: ["amount", "currency"],
      timeoutMs: 15000,
      reason: "Why.",
    });
    await client.proposeExternalConnectorChange({
      action: "revoke",
      capability: "erp:create-invoice",
      reason: "Why.",
    });

    expect(transport.requests[0]).toMatchObject({
      method: "POST",
      path: "/external-connectors/changes",
      body: {
        action: "register",
        capability: "erp:create-invoice",
        endpointUrl: "https://erp.example.com/parmana/release",
        policy: "erp-invoice",
        allowedParameters: ["amount", "currency"],
        timeoutMs: 15000,
        reason: "Why.",
      },
    });
    expect(transport.requests[1]?.body).toEqual({
      action: "revoke",
      capability: "erp:create-invoice",
      reason: "Why.",
    });
  });

  it("lists changes, filtered by status", async () => {
    const { client, transport } = clientWith({ changes: [{ changeId: "c" }] });

    expect(await client.externalConnectorChanges("PENDING_APPROVAL")).toEqual([
      { changeId: "c" },
    ]);
    await client.externalConnectorChanges();

    expect(transport.requests[0]?.path).toBe(
      "/external-connectors/changes?status=PENDING_APPROVAL",
    );
    expect(transport.requests[1]?.path).toBe("/external-connectors/changes");
  });

  it("approves and rejects with the step up on the change path", async () => {
    const { client, transport } = clientWith({ changeId: "c/1" });

    await client.approveExternalConnectorChange("c/1", stepUp);
    await client.rejectExternalConnectorChange("c-2", "No.", stepUp);

    expect(transport.requests[0]).toMatchObject({
      method: "POST",
      path: "/external-connectors/changes/c%2F1/approve",
      body: { stepUpAuthorization: stepUp },
    });
    expect(transport.requests[1]).toMatchObject({
      method: "POST",
      path: "/external-connectors/changes/c-2/reject",
      body: { rejectionReason: "No.", stepUpAuthorization: stepUp },
    });
  });
});
