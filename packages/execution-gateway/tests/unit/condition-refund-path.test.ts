import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import type {
  ConnectorExecutionContext,
  ConnectorRequest,
} from "@parmana/connector-sdk";
import { CryptoBootstrap, type Signer } from "@parmana/crypto";
import type { ResolvedAddress } from "@parmana/shared";

import {
  GatewayExternalAdapter,
  type ReleaseTransport,
  type ReleaseTransportRequest,
  type SignedExternalRelease,
} from "../../src/connector-execution/GatewayExternalAdapter.js";
import { buildConnectorEvidence } from "../../src/connector-execution/index.js";

import { verifyParmanaRelease } from "../../../../typescript/src/crypto/release.js";
import { createReleaseHandler } from "../../../../typescript/examples/07-external-connector-endpoint.js";

/**
 * F28-7, step 5: one path from a Core-signed release to recorded evidence.
 * The release is signed and verified; the endpoint finds a condition that
 * no longer holds, so it does not act (no refund); the answer is turned
 * into connector evidence, which records the failed condition.
 *
 * The endpoint's answer is shaped here, in the test, from the handler's
 * decision. The full Trust Record assembly (runtime package) is not run here.
 */

const ENDPOINT = "https://erp.example.com/parmana/release";
const NOW = new Date("2026-10-11T10:00:00.000Z");
const keys = generateKeyPairSync("ed25519");
const publicKeyPem = keys.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const signatureProvider = CryptoBootstrap.create().signature;
const signer: Signer = {
  sign: (_keyId, data) => signatureProvider.sign(data, keys.privateKey),
  getPublicKey: async () => keys.publicKey,
  getMetadata: async (keyId) => ({ keyId, algorithm: "ed25519" as never }),
  hasKey: async () => true,
};
const publicLookup = async (): Promise<readonly ResolvedAddress[]> => [
  { address: "203.0.114.10", family: 4 },
];

const request: ConnectorRequest = {
  capability: "erp:release-goods",
  businessTransactionId: "bt-7",
  action: "erp:release-goods",
  target: "invoices/INV-1",
  parameters: { invoiceId: "INV-1" },
};

const CONDITION = {
  signalKey: "invoicePaid",
  source: "erp",
  claim: "invoice.paid",
  subject: "INV-1",
  value: true,
  validUntil: "2026-10-11T10:00:20.000Z",
};

function context(): ConnectorExecutionContext {
  return {
    credential: {} as never,
    timeoutMs: 30_000,
    requestedAt: NOW,
    release: {
      authorizationId: "auth-7",
      policy: { name: "release-goods", version: "1.0.0" },
      approvals: [],
      conditions: [CONDITION],
    } as never,
  };
}

/** The endpoint: runs the documented release handler, and reports the condition it checked. */
function endpoint(holds: boolean) {
  const acted: string[] = [];
  const sent: SignedExternalRelease[] = [];
  const handle = createReleaseHandler({
    publicKeys: { default: publicKeyPem },
    audience: ENDPOINT,
    now: () => NOW,
    conditionsHold: async () => holds,
    act: async (release) => {
      acted.push(release.businessTransactionId);
      return { refunded: true };
    },
  });
  const send: ReleaseTransport = async (call: ReleaseTransportRequest) => {
    const release = JSON.parse(call.body) as SignedExternalRelease;
    sent.push(release);
    const answer = await handle(release);
    const body = {
      ...(answer.body as Record<string, unknown>),
      conditionsChecked: [
        {
          signalKey: CONDITION.signalKey,
          atomicity: "check-then-act",
          outcome: holds ? "holds" : "not-holding",
          evidence: {
            status: holds ? "paid" : "unpaid",
            observedAt: NOW.toISOString(),
          },
        },
      ],
    };
    return { status: answer.status, body: JSON.stringify(body) };
  };
  return { send, acted, sent };
}

function adapter(send: ReleaseTransport) {
  return new GatewayExternalAdapter({
    target: {
      capability: "erp:release-goods",
      endpointUrl: ENDPOINT,
      allowedParameters: ["invoiceId"],
      timeoutMs: 10_000,
    },
    signer,
    lookup: publicLookup,
    transport: send,
    now: () => NOW,
  });
}

describe("condition to refund path (F28-7, step 5)", () => {
  it("a failed condition stops the refund, and the answer is recorded as connector evidence", async () => {
    const { send, acted, sent } = endpoint(false);

    const response = await adapter(send).execute(request, context());

    // The release Core signed verifies, and carries the condition.
    const signed = sent[0];
    expect(signed).toBeDefined();
    const verdict = await verifyParmanaRelease(signed!, {
      publicKeys: { default: publicKeyPem },
      audience: ENDPOINT,
      isAlreadyExecuted: () => false,
      now: NOW,
    });
    expect(verdict.valid).toBe(true);
    expect(verdict.release.conditions).toEqual([CONDITION]);

    // The condition failed: no refund, and the answer says so.
    expect(acted).toEqual([]);
    expect(response.success).toBe(false);
    expect(response.metadata).toMatchObject({ conditionsNotMet: true });

    // The failed condition is in the evidence the Trust Record anchors.
    const evidence = await buildConnectorEvidence({
      connectorId: "erp",
      connectorVersion: { major: 1, minor: 0, patch: 0 },
      credentialProviderId: "static",
      request,
      response,
      startedAt: NOW,
      completedAt: NOW,
      crypto: CryptoBootstrap.create(),
    });
    expect(evidence.responseSummary.success).toBe(false);
    expect(evidence.responseSummary.metadata).toMatchObject({
      conditionsChecked: [
        {
          signalKey: "invoicePaid",
          outcome: "not-holding",
          evidence: { status: "unpaid" },
        },
      ],
    });
  });

  it("the evidence hash differs from the one for a held condition, so the refusal is bound to the record", async () => {
    const refused = endpoint(false);
    const held = endpoint(true);
    const crypto = CryptoBootstrap.create();
    const build = async (send: ReleaseTransport) =>
      buildConnectorEvidence({
        connectorId: "erp",
        connectorVersion: { major: 1, minor: 0, patch: 0 },
        credentialProviderId: "static",
        request,
        response: await adapter(send).execute(request, context()),
        startedAt: NOW,
        completedAt: NOW,
        crypto,
      });

    const refusedEvidence = await build(refused.send);
    const heldEvidence = await build(held.send);

    expect(held.acted).toEqual(["bt-7"]);
    expect(refusedEvidence.connectorEvidenceHash).not.toBe(
      heldEvidence.connectorEvidenceHash,
    );
  });
});
