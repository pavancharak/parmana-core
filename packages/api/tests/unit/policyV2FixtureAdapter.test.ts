import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";

import { describe, expect, it } from "vitest";

import { policyV2 } from "@parmana/policy";

import {
  answerFixtureQuery,
  type FixtureSourceOptions,
} from "../../../../test-support/policy-v2-fixture-source.js";

/** Test keys only. Never a production key. */
const pair = generateKeyPairSync("ed25519");
const privateKey: KeyObject = createPrivateKey(
  pair.privateKey.export({ type: "pkcs8", format: "pem" }),
);
const publicKey: KeyObject = createPublicKey(
  pair.publicKey.export({ type: "spki", format: "pem" }),
);
const otherPair = generateKeyPairSync("ed25519");
const otherPublicKey: KeyObject = otherPair.publicKey;

const NOW = new Date("2026-11-18T10:00:00.000Z");

const options: FixtureSourceOptions = {
  source: "accounts",
  keyId: "fixture-key-1",
  privateKey,
  token: "unused-here",
  invoices: {
    "INV-100": { amount: 1200, vendorId: "V-7", vendorStatus: "active" },
  },
  now: () => NOW,
};

const query = {
  source: "accounts",
  claim: "invoice.amount",
  subject: "INV-100",
  action: "erp:invoice-pay",
  transactionId: "txn-1",
};

function verify(
  answer: unknown,
  expected: Partial<typeof query> = {},
  deps: {
    keyFor?: () => KeyObject | "revoked" | undefined;
    now?: Date;
  } = {},
) {
  return policyV2.sourceAnswer.verifySourceAnswer(
    answer,
    { ...query, ...expected },
    {
      keyFor: deps.keyFor ?? (() => publicKey),
      nonces: new policyV2.sourceAnswer.MemoryNonceStore(() => NOW),
      now: deps.now ?? NOW,
    },
  );
}

describe("fixture adapter: a valid answer", () => {
  it("signs an answer the verifier accepts, with the value the invoice holds", async () => {
    const answer = answerFixtureQuery(query, options);
    expect(await verify(answer)).toEqual({ ok: true, value: 1200 });
  });

  it("states the unit for an amount, and no unit for a vendor claim", () => {
    const amount = answerFixtureQuery(query, options);
    const status = answerFixtureQuery(
      { ...query, claim: "vendor.status" },
      options,
    );
    expect(amount.payload.unit).toBe("USD");
    expect(status.payload.unit).toBeUndefined();
    expect(status.payload.value).toBe("active");
  });

  it("gives every answer a new nonce", () => {
    const first = answerFixtureQuery(query, options);
    const second = answerFixtureQuery(query, options);
    expect(first.payload.nonce).not.toBe(second.payload.nonce);
  });
});

describe("fixture adapter: each refusal the verifier produces", () => {
  it("BAD_SIGNATURE: an answer checked with the wrong key", async () => {
    const answer = answerFixtureQuery(query, options);
    expect(
      await verify(answer, {}, { keyFor: () => otherPublicKey }),
    ).toMatchObject({
      ok: false,
      code: "BAD_SIGNATURE",
    });
  });

  it("QUERY_MISMATCH: the answer is checked against a different subject", async () => {
    const answer = answerFixtureQuery(query, options);
    expect(await verify(answer, { subject: "INV-999" })).toMatchObject({
      ok: false,
      code: "QUERY_MISMATCH",
    });
  });

  it("UNKNOWN_KEY: the key id is not registered", async () => {
    const answer = answerFixtureQuery(query, options);
    expect(await verify(answer, {}, { keyFor: () => undefined })).toMatchObject(
      {
        ok: false,
        code: "UNKNOWN_KEY",
      },
    );
  });

  it("KEY_REVOKED: the key has been revoked", async () => {
    const answer = answerFixtureQuery(query, options);
    expect(await verify(answer, {}, { keyFor: () => "revoked" })).toMatchObject(
      {
        ok: false,
        code: "KEY_REVOKED",
      },
    );
  });

  it("EXPIRED: the answer is checked after its expiry", async () => {
    const answer = answerFixtureQuery(query, options);
    const later = new Date(NOW.getTime() + 10 * 60 * 1000);
    expect(await verify(answer, {}, { now: later })).toMatchObject({
      ok: false,
      code: "EXPIRED",
    });
  });

  it("NOT_YET_VALID: the answer is checked before it was observed, beyond the clock allowance", async () => {
    const answer = answerFixtureQuery(query, options);
    const earlier = new Date(NOW.getTime() - 5 * 60 * 1000);
    expect(await verify(answer, {}, { now: earlier })).toMatchObject({
      ok: false,
      code: "NOT_YET_VALID",
    });
  });

  it("REPLAYED: the same nonce is used twice", async () => {
    const answer = answerFixtureQuery(query, options);
    const nonces = new policyV2.sourceAnswer.MemoryNonceStore(() => NOW);
    const deps = { keyFor: () => publicKey, nonces, now: NOW };
    expect(
      await policyV2.sourceAnswer.verifySourceAnswer(answer, query, deps),
    ).toMatchObject({ ok: true });
    expect(
      await policyV2.sourceAnswer.verifySourceAnswer(answer, query, deps),
    ).toMatchObject({
      ok: false,
      code: "REPLAYED",
    });
  });

  it("UNSIGNED: an answer with no signature", async () => {
    const answer = answerFixtureQuery(query, options);
    expect(await verify({ payload: answer.payload })).toMatchObject({
      ok: false,
      code: "UNSIGNED",
    });
  });
});

describe("fixture adapter: refusals it gives instead of a value", () => {
  it("refuses an unknown source, claim, or subject with a status, and never guesses", () => {
    expect(() =>
      answerFixtureQuery({ ...query, source: "other" }, options),
    ).toThrow("Unknown source.");
    expect(() =>
      answerFixtureQuery({ ...query, claim: "vendor.bank" }, options),
    ).toThrow("Unknown claim.");
    expect(() =>
      answerFixtureQuery({ ...query, subject: "INV-999" }, options),
    ).toThrow("Unknown subject.");
  });

  it("refuses a query that is not complete", () => {
    expect(() => answerFixtureQuery({ source: "accounts" }, options)).toThrow(
      "The query is not valid.",
    );
  });
});
