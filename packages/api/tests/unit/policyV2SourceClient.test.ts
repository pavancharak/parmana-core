import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { policyV2 } from "@parmana/policy";

import {
  createFixtureSourceServer,
  type FixtureSourceOptions,
} from "../../../../test-support/policy-v2-fixture-source.js";
import {
  assertSourceUrl,
  createPolicyV2SourceClient,
} from "../../src/policyV2/policyV2SourceClient.js";
import { sourceClientFrom } from "../../src/policyV2/createPolicyV2Runtime.js";

/** Test key pair. Never a production key. */
const pair = generateKeyPairSync("ed25519");
const privateKey: KeyObject = createPrivateKey(
  pair.privateKey.export({ type: "pkcs8", format: "pem" }),
);
const publicKey: KeyObject = createPublicKey(
  pair.publicKey.export({ type: "spki", format: "pem" }),
);

const TOKEN = "test-token-not-real";

const invoices = {
  "INV-100": { amount: 1200, vendorId: "V-7", vendorStatus: "active" as const },
  "INV-200": { amount: 50, vendorId: "V-9", vendorStatus: "blocked" as const },
};

function fixtureOptions(
  overrides: Partial<FixtureSourceOptions> = {},
): FixtureSourceOptions {
  return {
    source: "accounts",
    keyId: "fixture-key-1",
    privateKey,
    token: TOKEN,
    invoices,
    ...overrides,
  };
}

const query = {
  source: "accounts",
  claim: "invoice.amount",
  subject: "INV-100",
  action: "erp:invoice-pay",
  transactionId: "txn-1",
};

let server: Server | undefined;
let baseUrl = "";

async function startFixture(
  overrides: Partial<FixtureSourceOptions> = {},
): Promise<void> {
  server = createFixtureSourceServer(fixtureOptions(overrides));
  await new Promise<void>((resolve) =>
    server!.listen(0, "127.0.0.1", () => resolve()),
  );
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  if (server !== undefined) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

beforeEach(() => {
  baseUrl = "";
});

describe("source client round trip", () => {
  it("returns an answer the decision service verifies", async () => {
    await startFixture();
    const client = createPolicyV2SourceClient({
      url: baseUrl,
      token: TOKEN,
      timeoutMs: 2000,
    });

    const answer = await client(query);
    const result = await policyV2.sourceAnswer.verifySourceAnswer(
      answer,
      query,
      {
        keyFor: () => publicKey,
        nonces: new policyV2.sourceAnswer.MemoryNonceStore(() => new Date()),
        now: new Date(),
      },
    );

    expect(result).toEqual({ ok: true, value: 1200 });
  });

  it("refuses a second use of the same answer as REPLAYED", async () => {
    await startFixture();
    const client = createPolicyV2SourceClient({ url: baseUrl, token: TOKEN });
    const nonces = new policyV2.sourceAnswer.MemoryNonceStore(() => new Date());
    const answer = await client(query);
    const deps = { keyFor: () => publicKey, nonces, now: new Date() };

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

  it("refuses an answer that is checked after it has expired", async () => {
    const past = new Date("2026-01-01T00:00:00Z");
    await startFixture({ now: () => past, validMs: 60_000 });
    const client = createPolicyV2SourceClient({ url: baseUrl, token: TOKEN });

    const answer = await client(query);
    const result = await policyV2.sourceAnswer.verifySourceAnswer(
      answer,
      query,
      {
        keyFor: () => publicKey,
        nonces: new policyV2.sourceAnswer.MemoryNonceStore(() => new Date()),
        now: new Date("2026-06-01T00:00:00Z"),
      },
    );

    expect(result).toMatchObject({ ok: false, code: "EXPIRED" });
  });
});

describe("source client failures (each one throws, so the decision refuses)", () => {
  it("throws on the wrong token", async () => {
    await startFixture();
    const client = createPolicyV2SourceClient({ url: baseUrl, token: "wrong" });
    await expect(client(query)).rejects.toThrow("HTTP 401");
  });

  it("throws for a subject the source does not know", async () => {
    await startFixture();
    const client = createPolicyV2SourceClient({ url: baseUrl, token: TOKEN });
    await expect(client({ ...query, subject: "INV-999" })).rejects.toThrow(
      "HTTP 404",
    );
  });

  it("throws for a claim the source does not answer", async () => {
    await startFixture();
    const client = createPolicyV2SourceClient({ url: baseUrl, token: TOKEN });
    await expect(client({ ...query, claim: "vendor.bank" })).rejects.toThrow(
      "HTTP 404",
    );
  });

  it("throws when the source does not answer within the timeout", async () => {
    const hangs = (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      });
    const client = createPolicyV2SourceClient({
      url: "https://adapter.example.test",
      token: TOKEN,
      timeoutMs: 50,
      fetch: hangs as unknown as typeof fetch,
    });
    await expect(client(query)).rejects.toThrow("aborted");
  });
});

describe("source URL and token rules", () => {
  it("accepts https", () => {
    expect(assertSourceUrl("https://adapter.example.test/base").protocol).toBe(
      "https:",
    );
  });

  it("accepts plain http only for a loopback address", () => {
    expect(assertSourceUrl("http://127.0.0.1:8080").protocol).toBe("http:");
    expect(() => assertSourceUrl("http://adapter.example.test")).toThrow(
      "must use https",
    );
  });

  it("rejects a URL that is not a URL", () => {
    expect(() => assertSourceUrl("not a url")).toThrow("not a valid URL");
  });

  it("rejects an empty token", () => {
    expect(() =>
      createPolicyV2SourceClient({
        url: "https://adapter.example.test",
        token: " ",
      }),
    ).toThrow("token is empty");
  });
});

describe("runtime wiring (sourceClientFrom)", () => {
  it("keeps the refusal when no source URL is set", async () => {
    const client = sourceClientFrom({});
    await expect(client(query)).rejects.toThrow(
      "No source integration is connected.",
    );
  });

  it("stops the start-up when a URL is set without a token", () => {
    expect(() =>
      sourceClientFrom({
        PARMANA_POLICY_V2_SOURCE_URL: "https://adapter.example.test",
      }),
    ).toThrow("PARMANA_POLICY_V2_SOURCE_TOKEN must be set");
  });

  it("builds a client when the URL and token are set", () => {
    const client = sourceClientFrom({
      PARMANA_POLICY_V2_SOURCE_URL: "https://adapter.example.test",
      PARMANA_POLICY_V2_SOURCE_TOKEN: TOKEN,
    });
    expect(typeof client).toBe("function");
  });
});
