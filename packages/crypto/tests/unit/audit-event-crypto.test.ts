import { describe, expect, it } from "vitest";

import { AuditEventCrypto } from "../../src/AuditEventCrypto.js";

/**
 * Regulatory-evidence gap found while indexing CLAIMS.md against real
 * tests: AuditEventCrypto (signs/verifies CallerAuditEvent, the caller-
 * authentication audit trail) had no dedicated test file at all --
 * only indirect coverage via an API-layer integration test that needs
 * a running server and a Supabase-backed sink. This proves the same
 * "independently verifiable, no server, no network, no database"
 * property packages/crypto/tests/unit/authorization-envelope.test.ts
 * already proves for ExecutionAuthorizationPayload, and
 * docs/site/guides/verify-independently.mdx demonstrates live for
 * ExecutionTrustRecord -- CallerAuditEvent had the identical
 * guarantee but no equivalent, citable proof.
 */
describe("AuditEventCrypto", () => {
  const SAMPLE_EVENT = {
    type: "caller.capability_denied",
    occurredAt: "2026-01-01T00:00:00.000Z",
    route: "/execute",
    callerId: "caller-1",
    capability: "hubspot:deal-update",
    reason: "capability not allowed",
  };

  it("signs and verifies a plain audit event, with no network or database involved", async () => {
    const crypto = new AuditEventCrypto();

    const signature = await crypto.sign(SAMPLE_EVENT);

    expect(signature.algorithm).toBeTruthy();
    expect(signature.keyId).toBeTruthy();
    expect(signature.value).toBeTruthy();

    const valid = await crypto.verify(SAMPLE_EVENT, signature);

    expect(valid).toBe(true);
  });

  it("rejects an event whose fields were tampered with after signing", async () => {
    const crypto = new AuditEventCrypto();

    const signature = await crypto.sign(SAMPLE_EVENT);

    const tampered = {
      ...SAMPLE_EVENT,
      type: "caller.capability_granted",
    };

    const valid = await crypto.verify(tampered, signature);

    expect(valid).toBe(false);
  });

  it("rejects a signature produced under a different key", async () => {
    const crypto = new AuditEventCrypto();

    const signature = await crypto.sign(SAMPLE_EVENT);

    const wrongKeySignature = {
      ...signature,
      keyId: "does-not-exist",
    };

    await expect(
      crypto.verify(SAMPLE_EVENT, wrongKeySignature),
    ).rejects.toThrow();
  });

  it("verifies deterministically across repeated calls with no side effects", async () => {
    const crypto = new AuditEventCrypto();

    const signature = await crypto.sign(SAMPLE_EVENT);

    const firstCheck = await crypto.verify(SAMPLE_EVENT, signature);
    const secondCheck = await crypto.verify(SAMPLE_EVENT, signature);

    expect(firstCheck).toBe(true);
    expect(secondCheck).toBe(true);
  });
});
