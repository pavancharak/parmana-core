import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  MemoryNonceStore,
  signAnswer,
  verifySourceAnswer,
  type AnswerPayload,
  type ExpectedQuery,
  type KeyLookup,
} from "../../src/v2/sourceAnswer.js";
import { PolicyRegister, type Person } from "../../src/v2/register.js";

/** Tests for the source signing contract (design 4.1; plan step 2). */

const NOW = new Date("2026-11-18T09:00:00.000Z");
const ISO = (ms: number) => new Date(ms).toISOString();

const ledger = generateKeyPairSync("ed25519");
const otherKey = generateKeyPairSync("ed25519");

const query: ExpectedQuery = {
  source: "ledger",
  claim: "funds.available",
  subject: "ACC-1",
  action: "erp:pay-invoice",
  transactionId: "tx-1",
};

function payload(overrides: Partial<AnswerPayload> = {}): AnswerPayload {
  return {
    source: "ledger",
    keyId: "ledger-key-1",
    claim: "funds.available",
    subject: "ACC-1",
    value: true,
    action: "erp:pay-invoice",
    transactionId: "tx-1",
    nonce: "n-" + Math.random().toString(36).slice(2),
    observedAt: ISO(NOW.getTime() - 1_000),
    expiresAt: ISO(NOW.getTime() + 60_000),
    ...overrides,
  };
}

const keyFor: KeyLookup = (source, keyId) =>
  source === "ledger" && keyId === "ledger-key-1"
    ? ledger.publicKey
    : undefined;

async function verify(
  answer: unknown,
  nonces = new MemoryNonceStore(() => NOW),
  now = NOW,
) {
  return await verifySourceAnswer(answer, query, { keyFor, nonces, now });
}

describe("verifySourceAnswer", () => {
  it("accepts an answer signed with the registered key", async () => {
    const answer = signAnswer(payload(), ledger.privateKey);
    expect(await verify(answer)).toEqual({ ok: true, value: true });
  });

  it("refuses an unsigned answer", async () => {
    const result = await verify({ payload: payload() });
    expect(result).toMatchObject({ ok: false, code: "UNSIGNED" });
  });

  it("refuses an answer signed with another key", async () => {
    const answer = signAnswer(payload(), otherKey.privateKey);
    expect(await verify(answer)).toMatchObject({
      ok: false,
      code: "BAD_SIGNATURE",
    });
  });

  it("refuses an answer whose value was changed after signing", async () => {
    const answer = signAnswer(payload({ value: false }), ledger.privateKey);
    const tampered = { ...answer, payload: { ...answer.payload, value: true } };
    expect(await verify(tampered)).toMatchObject({
      ok: false,
      code: "BAD_SIGNATURE",
    });
  });

  it("refuses an answer whose key id is not registered for the source", async () => {
    const answer = signAnswer(
      payload({ keyId: "unknown-key" }),
      ledger.privateKey,
    );
    expect(await verify(answer)).toMatchObject({
      ok: false,
      code: "UNKNOWN_KEY",
    });
  });

  it("refuses an answer from a revoked source", async () => {
    const revoked: KeyLookup = () => "revoked";
    const answer = signAnswer(payload(), ledger.privateKey);
    const result = await verifySourceAnswer(answer, query, {
      keyFor: revoked,
      nonces: new MemoryNonceStore(() => NOW),
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, code: "KEY_REVOKED" });
  });

  it("refuses an expired answer", async () => {
    const answer = signAnswer(
      payload({ expiresAt: ISO(NOW.getTime() - 1) }),
      ledger.privateKey,
    );
    expect(await verify(answer)).toMatchObject({ ok: false, code: "EXPIRED" });
  });

  it("refuses an answer observed in the future beyond the clock skew", async () => {
    const answer = signAnswer(
      payload({ observedAt: ISO(NOW.getTime() + 120_000) }),
      ledger.privateKey,
    );
    expect(await verify(answer)).toMatchObject({
      ok: false,
      code: "NOT_YET_VALID",
    });
  });

  it("refuses a replayed answer, but accepts it the first time", async () => {
    const nonces = new MemoryNonceStore(() => NOW);
    const answer = signAnswer(
      payload({ nonce: "fixed-nonce" }),
      ledger.privateKey,
    );
    expect((await verify(answer, nonces)).ok).toBe(true);
    expect(await verify(answer, nonces)).toMatchObject({
      ok: false,
      code: "REPLAYED",
    });
  });

  it("does not use up a nonce on an answer refused for another reason", async () => {
    const nonces = new MemoryNonceStore(() => NOW);
    const expired = signAnswer(
      payload({ nonce: "shared", expiresAt: ISO(NOW.getTime() - 1) }),
      ledger.privateKey,
    );
    expect(await verify(expired, nonces)).toMatchObject({ code: "EXPIRED" });
    const fresh = signAnswer(payload({ nonce: "shared" }), ledger.privateKey);
    expect((await verify(fresh, nonces)).ok).toBe(true);
  });

  it("refuses an answer for a different subject, claim, action or transaction", async () => {
    const answer = signAnswer(payload({ subject: "ACC-2" }), ledger.privateKey);
    expect(await verify(answer)).toMatchObject({
      ok: false,
      code: "QUERY_MISMATCH",
    });
  });

  it("refuses an incomplete answer", async () => {
    expect(await verify("not an answer")).toMatchObject({ code: "MALFORMED" });
    expect(
      await verify({ payload: { source: "ledger" }, signature: "x" }),
    ).toMatchObject({ code: "MALFORMED" });
  });
});

describe("the register and the signing contract together", () => {
  const sourceOwner: Person = { id: "owner-1", roles: ["source-owner"] };
  const second: Person = { id: "second-1", roles: ["second-approver"] };

  it("verifies an answer against the key the register holds, and refuses it once the source is revoked", async () => {
    const register = new PolicyRegister(() => NOW);
    register.proposeSource(
      {
        name: "ledger",
        dataOwner: "finance",
        signer: { kind: "system" },
        keyId: "ledger-key-1",
        publicKeyPem: ledger.publicKey
          .export({ type: "spki", format: "pem" })
          .toString(),
        claims: { "funds.available": "" },
        canApprove: false,
      },
      sourceOwner,
    );
    register.approveSource("ledger", second);
    const nonces = new MemoryNonceStore(() => NOW);
    const answer = signAnswer(payload(), ledger.privateKey);

    const beforeRevoke = await verifySourceAnswer(answer, query, {
      keyFor: (s, k) => register.keyFor(s, k),
      nonces,
      now: NOW,
    });
    expect(beforeRevoke.ok).toBe(true);

    register.revokeSource(
      "ledger",
      { id: "parmana-1", roles: ["parmana-owner"] },
      "key exposed",
    );
    const afterRevoke = await verifySourceAnswer(
      signAnswer(payload(), ledger.privateKey),
      query,
      {
        keyFor: (s, k) => register.keyFor(s, k),
        nonces,
        now: NOW,
      },
    );
    expect(afterRevoke).toMatchObject({ ok: false, code: "KEY_REVOKED" });
  });
});
