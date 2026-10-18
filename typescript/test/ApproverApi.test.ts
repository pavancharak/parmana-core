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

describe("approver changes", () => {
  it("lists approver keys", async () => {
    const { client, transport } = clientWith({
      issuers: [{ approverId: "a", keyId: "k", source: "code" }],
    });

    expect(await client.approvers()).toEqual([
      { approverId: "a", keyId: "k", source: "code" },
    ]);
    expect(transport.requests[0]).toMatchObject({
      method: "GET",
      path: "/approval-issuers",
    });
  });

  it("proposes an add and a revoke", async () => {
    const { client, transport } = clientWith({ changeId: "c-1" });

    await client.proposeApproverChange({
      action: "add",
      approverId: "manager-priya",
      keyId: "manager-priya-key-1",
      publicKeyPem: "PEM",
      reason: "Why.",
    });
    await client.proposeApproverChange({
      action: "revoke",
      approverId: "manager-priya",
      keyId: "manager-priya-key-1",
      reason: "Why.",
    });

    expect(transport.requests[0]).toMatchObject({
      method: "POST",
      path: "/approval-issuers/changes",
      body: {
        action: "add",
        approverId: "manager-priya",
        keyId: "manager-priya-key-1",
        publicKeyPem: "PEM",
        reason: "Why.",
      },
    });
    expect(transport.requests[1]?.body).toEqual({
      action: "revoke",
      approverId: "manager-priya",
      keyId: "manager-priya-key-1",
      reason: "Why.",
    });
  });

  it("lists changes, filtered by status", async () => {
    const { client, transport } = clientWith({ changes: [{ changeId: "c" }] });

    expect(await client.approverChanges("PENDING_APPROVAL")).toEqual([
      { changeId: "c" },
    ]);
    await client.approverChanges();

    expect(transport.requests[0]?.path).toBe(
      "/approval-issuers/changes?status=PENDING_APPROVAL",
    );
    expect(transport.requests[1]?.path).toBe("/approval-issuers/changes");
  });

  it("approves and rejects with the step up on the change path", async () => {
    const { client, transport } = clientWith({ changeId: "c/1" });

    await client.approveApproverChange("c/1", stepUp);
    await client.rejectApproverChange("c-2", "No.", stepUp);

    expect(transport.requests[0]).toMatchObject({
      method: "POST",
      path: "/approval-issuers/changes/c%2F1/approve",
      body: { stepUpAuthorization: stepUp },
    });
    expect(transport.requests[1]).toMatchObject({
      method: "POST",
      path: "/approval-issuers/changes/c-2/reject",
      body: { rejectionReason: "No.", stepUpAuthorization: stepUp },
    });
  });
});
