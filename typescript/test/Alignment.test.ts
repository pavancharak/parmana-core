/**
 * Parmana TypeScript SDK
 *
 * Unit tests for the methods added to align the TypeScript SDK with the API
 * and with the Python SDK (SDK 1.3.0): policy governance, caller identity,
 * public keys, Trust Record listing, the latest receipt, offline
 * verification, and step up signing.
 */

import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  PolicyChangeStepUpAuthorizationVerifier,
  verifyExecutionTrustRecordOffline as serverVerifyTrustRecord,
} from "@parmana/crypto";

import type {
  Transport,
  TransportRequest,
  TransportResponse,
} from "../src/config/Transport.js";

import { ParmanaClient } from "../src/client/ParmanaClient.js";
import {
  canonicalSerialize,
  signPolicyChangeStepUp,
  verifyExecutionIntentOffline,
  verifyExecutionTrustRecordOffline,
} from "../src/index.js";

class FakeTransport implements Transport {
  public lastRequest: TransportRequest | undefined;

  constructor(private readonly body: unknown = {}) {}

  async send<T>(request: TransportRequest): Promise<TransportResponse<T>> {
    this.lastRequest = request;
    return { status: 200, headers: {}, body: this.body as T };
  }
}

function clientWith(body: unknown = {}) {
  const transport = new FakeTransport(body);
  const client = new ParmanaClient({
    endpoint: "http://127.0.0.1:3000",
    transport,
  });
  return { client, transport };
}

const here = dirname(fileURLToPath(import.meta.url));

// The same real, server signed intent and server public key the Python SDK's
// tests use (python/tests/test_offline_intent_verifier.py).
const SERVER_INTENT = JSON.parse(
  readFileSync(
    join(
      here,
      "..",
      "..",
      "python",
      "tests",
      "fixtures",
      "execution-intent-server-signed.json",
    ),
    "utf8",
  ),
) as Record<string, unknown>;

const SERVER_KEY =
  "-----BEGIN PUBLIC KEY-----\n" +
  "MCowBQYDK2VwAyEACk6S6j13E+EIdvTezLLwosO4fohNZkhF/j+6FTk6LVI=\n" +
  "-----END PUBLIC KEY-----\n";

describe("policy governance", () => {
  it("proposes a change to the policy named in the URL", async () => {
    const { client, transport } = clientWith({ pendingPolicyChangeId: "c-1" });

    const content = { policyId: "customer-refund", policyVersion: "1.0.0" };
    const result = await client.proposePolicyChange(
      "customer-refund",
      "1.0.0",
      {
        proposedContent: content,
        reason: "Adopt it.",
      },
    );

    expect(result.pendingPolicyChangeId).toBe("c-1");
    expect(transport.lastRequest).toMatchObject({
      method: "POST",
      path: "/policies/customer-refund/1.0.0/pending-changes",
      body: { proposedContent: content, reason: "Adopt it." },
    });
  });

  it("lists changes, unwrapping the response's `changes` array", async () => {
    const { client, transport } = clientWith({
      changes: [{ pendingPolicyChangeId: "c-1" }],
    });

    const all = await client.policyChanges();
    expect(all).toEqual([{ pendingPolicyChangeId: "c-1" }]);
    expect(transport.lastRequest).toMatchObject({
      method: "GET",
      path: "/policies/pending-changes",
    });

    await client.policyChanges("PENDING_APPROVAL");
    expect(transport.lastRequest?.path).toBe(
      "/policies/pending-changes?status=PENDING_APPROVAL",
    );
  });

  it("approves and rejects with the step up authorization in the body", async () => {
    const { client, transport } = clientWith({ status: "APPROVED" });
    const { privateKey } = generateKeyPairSync("ed25519");
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });

    const approve = signPolicyChangeStepUp({
      pendingPolicyChangeId: "c-1",
      action: "approve",
      privateKeyPem: String(privateKeyPem),
      keyId: "bob",
    });
    await client.approvePolicyChange("c-1", approve);
    expect(transport.lastRequest).toMatchObject({
      method: "POST",
      path: "/policies/pending-changes/c-1/approve",
      body: { stepUpAuthorization: approve },
    });

    const reject = signPolicyChangeStepUp({
      pendingPolicyChangeId: "c-1",
      action: "reject",
      privateKeyPem: String(privateKeyPem),
      keyId: "bob",
    });
    await client.rejectPolicyChange("c-1", "Not needed.", reject);
    expect(transport.lastRequest).toMatchObject({
      method: "POST",
      path: "/policies/pending-changes/c-1/reject",
      body: { rejectionReason: "Not needed.", stepUpAuthorization: reject },
    });
  });
});

describe("policy in effect", () => {
  it("reads the policy in effect and what a request must carry", async () => {
    const body = {
      capability: "paytm:refund",
      policy: {
        name: "customer-refund",
        version: "1.2.0",
        schemaVersion: "1.0.0",
      },
      description: "Every refund needs a signed manager approval.",
      signals: {
        facts: ["managerApproved", "refundAmount"],
        schema: { managerApproved: "boolean", refundAmount: "number" },
        bound: { refundAmount: "parameters.amount" },
        approval: {
          managerApproved: {
            resourceId: "parameters.orderId",
            value: "parameters.amount",
          },
        },
      },
    };
    const { client, transport } = clientWith(body);

    const result = await client.policyInEffect("paytm:refund");

    expect(result).toEqual(body);
    expect(result.signals.approval.managerApproved?.resourceId).toBe(
      "parameters.orderId",
    );
    expect(transport.lastRequest).toMatchObject({
      method: "GET",
      path: "/policies/in-effect?capability=paytm%3Arefund",
    });
  });
});

describe("caller, keys, trust records, receipts", () => {
  it("reads the caller identity", async () => {
    const { client, transport } = clientWith({ callerId: "local-operator" });
    expect((await client.caller()).callerId).toBe("local-operator");
    expect(transport.lastRequest).toMatchObject({
      method: "GET",
      path: "/callers/me",
    });
  });

  it("reads a public key, `default` when no key ID is given", async () => {
    const { client, transport } = clientWith({ keyId: "default", pem: "PEM" });
    await client.publicKey();
    expect(transport.lastRequest?.path).toBe("/keys/default");
    await client.publicKey("gateway");
    expect(transport.lastRequest?.path).toBe("/keys/gateway");
  });

  it("lists Trust Records with paging and an optional date range", async () => {
    const { client, transport } = clientWith([]);
    await client.trustRecords();
    expect(transport.lastRequest?.path).toBe(
      "/trust-records?page=1&pageSize=25",
    );
    await client.trustRecords(2, 10, {
      since: "2026-09-01T00:00:00Z",
      until: "2026-09-30T00:00:00Z",
    });
    expect(transport.lastRequest?.path).toBe(
      "/trust-records?page=2&pageSize=10&since=2026-09-01T00%3A00%3A00Z&until=2026-09-30T00%3A00%3A00Z",
    );
  });

  it("reads the latest receipt without generating one", async () => {
    const { client, transport } = clientWith({ receiptId: "r-1" });
    await client.latestReceipt("tx-1");
    expect(transport.lastRequest).toMatchObject({
      method: "GET",
      path: "/receipt/latest/tx-1",
    });
  });
});

describe("signPolicyChangeStepUp", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = String(
    privateKey.export({ type: "pkcs8", format: "pem" }),
  );

  it("is accepted by the server's own step up verifier", async () => {
    const authorization = signPolicyChangeStepUp({
      pendingPolicyChangeId: "c-1",
      action: "approve",
      privateKeyPem,
      keyId: "bob",
    });

    const result = await new PolicyChangeStepUpAuthorizationVerifier().verify(
      authorization,
      publicKey,
      { pendingPolicyChangeId: "c-1", action: "approve" },
    );

    expect(result.valid).toBe(true);
  });

  it("signs the canonical JSON of the payload, valid for 120 seconds by default", () => {
    const authorization = signPolicyChangeStepUp({
      pendingPolicyChangeId: "c-1",
      action: "reject",
      privateKeyPem,
      keyId: "bob",
    });

    expect(authorization.algorithm).toBe("ed25519");
    expect(authorization.payload.version).toBe(1);
    expect(
      Date.parse(authorization.payload.expiresAt) -
        Date.parse(authorization.payload.authorizedAt),
    ).toBe(120_000);
    expect(
      verify(
        null,
        canonicalSerialize(authorization.payload),
        publicKey,
        Buffer.from(authorization.signature, "base64"),
      ),
    ).toBe(true);
  });

  it("refuses a key that is not Ed25519, a bad action and a bad TTL", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    expect(() =>
      signPolicyChangeStepUp({
        pendingPolicyChangeId: "c-1",
        action: "approve",
        privateKeyPem: String(
          rsa.privateKey.export({ type: "pkcs8", format: "pem" }),
        ),
        keyId: "bob",
      }),
    ).toThrow(/Ed25519/);

    expect(() =>
      signPolicyChangeStepUp({
        pendingPolicyChangeId: "c-1",
        action: "delete" as "approve",
        privateKeyPem,
        keyId: "bob",
      }),
    ).toThrow(/approve/);

    expect(() =>
      signPolicyChangeStepUp({
        pendingPolicyChangeId: "c-1",
        action: "approve",
        privateKeyPem,
        keyId: "bob",
        ttlSeconds: 0,
      }),
    ).toThrow(/TTL/);
  });
});

describe("offline verification", () => {
  it("verifies a real server signed Execution Intent with only the public key", () => {
    const result = verifyExecutionIntentOffline(SERVER_INTENT, {
      default: SERVER_KEY,
    });

    expect(result).toEqual({
      valid: true,
      hashValid: true,
      legacySignatureValid: true,
      algorithmsChecked: ["ed25519"],
      errors: [],
    });
  });

  it("rejects the same intent with one field changed", () => {
    const result = verifyExecutionIntentOffline(
      { ...SERVER_INTENT, target: "somewhere-else" },
      { default: SERVER_KEY },
    );

    expect(result.valid).toBe(false);
    expect(result.hashValid).toBe(false);
    expect(result.legacySignatureValid).toBe(false);
  });

  it("reports a missing public key instead of throwing", () => {
    const result = verifyExecutionIntentOffline(SERVER_INTENT, {});

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'no public key supplied for keyId "default".',
    ]);
  });

  it("rejects a key of the wrong kind with a readable error", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const result = verifyExecutionIntentOffline(SERVER_INTENT, {
      default: String(rsa.publicKey.export({ type: "spki", format: "pem" })),
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/not an Ed25519 key/);
  });

  it("verifies a Trust Record signed the way the server signs one, and rejects a hybrid record", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");

    const body = {
      trustRecordId: "tr-1",
      businessTransactionId: "tx-1",
      transaction: { businessTransactionId: "tx-1", note: "Zürich ₹ 日本" },
      executions: [],
      createdAt: "2026-09-25T00:00:00.000Z",
    };
    const canonical = canonicalSerialize(body);
    const { createHash, sign } = await import("node:crypto");
    const record = {
      ...body,
      trustRecordHash: createHash("sha256").update(canonical).digest("hex"),
      signature: {
        algorithm: "ed25519",
        keyId: "default",
        value: sign(null, canonical, privateKey).toString("base64"),
      },
    };
    const pem = String(publicKey.export({ type: "spki", format: "pem" }));

    expect(
      verifyExecutionTrustRecordOffline(record, { default: pem }).valid,
    ).toBe(true);

    // The server's own reference verifier agrees.
    const reference = await serverVerifyTrustRecord(record, { default: pem });
    expect(reference.valid).toBe(true);

    const hybrid = verifyExecutionTrustRecordOffline(
      { ...record, signatures: [{ algorithm: "dilithium3" }] },
      { default: pem },
    );
    expect(hybrid.valid).toBe(false);
    expect(hybrid.errors.join(" ")).toMatch(/ML-DSA-65/);
    expect(createPublicKey(pem).asymmetricKeyType).toBe("ed25519");
  });
});

describe("HTTP errors carry the status", () => {
  it("sets statusCode on every error made from a response", async () => {
    const { mapHttpErrorResponse } =
      await import("../src/transport/mapHttpErrorResponse.js");

    expect(
      mapHttpErrorResponse(403, { error: "no", code: "POLICY_DENIED" })
        .statusCode,
    ).toBe(403);
    const unavailable = mapHttpErrorResponse(503, {
      error: "No connector",
      code: "CONNECTOR_NOT_REGISTERED",
    });
    expect(unavailable.statusCode).toBe(503);
    expect((unavailable as { serverCode?: string }).serverCode).toBe(
      "CONNECTOR_NOT_REGISTERED",
    );
    expect(mapHttpErrorResponse(401, {}).statusCode).toBe(401);
  });
});
