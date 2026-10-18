import { CryptoBootstrap, TrustRecordHasher } from "@parmana/crypto";
import { describe, expect, it } from "vitest";

import type {
  ConnectorRequest,
  ConnectorResponse,
} from "@parmana/connector-sdk";

import {
  buildConnectorEvidence,
  redactSensitiveKeys,
  sanitizeEndpoint,
} from "../../src/connector-execution/index.js";

const crypto = CryptoBootstrap.create();

function fixtureRequest(): ConnectorRequest {
  return {
    capability: "http:post",
    businessTransactionId: "txn-1",
    action: "http:post",
    target:
      "https://user:sk_live_secret@api.stripe.com/v1/charges?api_key=sk_live_secret",
    parameters: { amount: 1000, currency: "usd" },
  };
}

function fixtureResponse(): ConnectorResponse {
  return { success: true, metadata: { status: 200, apiKey: "sk_live_leaked" } };
}

describe("ConnectorEvidence", () => {
  it("sanitizes credentials and query parameters out of URL-shaped endpoints", () => {
    expect(
      sanitizeEndpoint(
        "https://user:sk_live_secret@api.stripe.com/v1/charges?api_key=sk_live_secret",
      ),
    ).toBe("https://api.stripe.com/v1/charges");
  });

  it("passes through non-URL targets unchanged (minus any query suffix)", () => {
    expect(sanitizeEndpoint("crm/contacts/1?token=abc")).toBe("crm/contacts/1");
    expect(sanitizeEndpoint("crm/contacts/1")).toBe("crm/contacts/1");
  });

  it("redacts credential-shaped response metadata keys", () => {
    const redacted = redactSensitiveKeys({
      status: 200,
      apiKey: "sk_live_leaked",
      recordId: "abc",
    });
    expect(redacted).toEqual({
      status: 200,
      apiKey: "[REDACTED]",
      recordId: "abc",
    });
  });

  it("builds evidence whose hash is produced by the existing TrustRecordHasher, not an alternative hash", async () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const completedAt = new Date("2026-01-01T00:00:01.000Z");

    const evidence = await buildConnectorEvidence({
      connectorId: "stripe",
      connectorVersion: { major: 1, minor: 2, patch: 3 },
      credentialProviderId: "static",
      request: fixtureRequest(),
      response: fixtureResponse(),
      startedAt,
      completedAt,
      crypto,
    });

    const { connectorEvidenceHash, ...unhashed } = evidence;
    const independentlyComputed = await new TrustRecordHasher(crypto).hash(
      unhashed,
    );
    expect(connectorEvidenceHash).toBe(independentlyComputed);
  });

  it("is deterministic for identical inputs", async () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const completedAt = new Date("2026-01-01T00:00:01.000Z");
    const options = {
      connectorId: "stripe",
      connectorVersion: { major: 1, minor: 2, patch: 3 },
      credentialProviderId: "static",
      request: fixtureRequest(),
      response: fixtureResponse(),
      startedAt,
      completedAt,
      crypto,
    };

    const first = await buildConnectorEvidence(options);
    const second = await buildConnectorEvidence(options);
    expect(first.connectorEvidenceHash).toBe(second.connectorEvidenceHash);
  });

  it("never leaks credential or query-embedded secrets into evidence", async () => {
    const evidence = await buildConnectorEvidence({
      connectorId: "stripe",
      connectorVersion: { major: 1, minor: 2, patch: 3 },
      credentialProviderId: "static",
      request: fixtureRequest(),
      response: fixtureResponse(),
      startedAt: new Date(),
      completedAt: new Date(),
      crypto,
    });

    expect(JSON.stringify(evidence)).not.toContain("sk_live_secret");
    expect(JSON.stringify(evidence)).not.toContain("sk_live_leaked");
  });

  // docs/VERIFICATION-GAPS.md G-45 (Record 3): every connector in this
  // codebase today only observes and hashes its own HTTP response, none
  // independently verifies a vendor-originated cryptographic
  // confirmation -- this should be visible in the evidence itself, not
  // only in prose documentation.
  it("defaults vendorConfirmationVerified to false when the caller doesn't pass it", async () => {
    const evidence = await buildConnectorEvidence({
      connectorId: "stripe",
      connectorVersion: { major: 1, minor: 2, patch: 3 },
      credentialProviderId: "static",
      request: fixtureRequest(),
      response: fixtureResponse(),
      startedAt: new Date(),
      completedAt: new Date(),
      crypto,
    });

    expect(evidence.vendorConfirmationVerified).toBe(false);
  });

  it("records vendorConfirmationVerified: true when a caller explicitly asserts it, and folds it into the hash", async () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const completedAt = new Date("2026-01-01T00:00:01.000Z");
    const shared = {
      connectorId: "stripe",
      connectorVersion: { major: 1, minor: 2, patch: 3 },
      credentialProviderId: "static",
      request: fixtureRequest(),
      response: fixtureResponse(),
      startedAt,
      completedAt,
      crypto,
    };

    const unverified = await buildConnectorEvidence(shared);
    const verified = await buildConnectorEvidence({
      ...shared,
      vendorConfirmationVerified: true,
    });

    expect(verified.vendorConfirmationVerified).toBe(true);
    expect(verified.connectorEvidenceHash).not.toBe(
      unverified.connectorEvidenceHash,
    );
  });
});
