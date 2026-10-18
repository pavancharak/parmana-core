import crypto, { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CanonicalSerializer,
  CryptoBootstrap,
  type Signer,
} from "@parmana/crypto";
import type { ReleaseTransport } from "@parmana/execution-gateway";
import { PolicyAction, type Policy } from "@parmana/policy";
import { TrustedSignalResolver } from "@parmana/runtime";
import {
  BusinessValidationStatus,
  PendingPolicyChangeStatus,
  type BusinessSignalSourceRegistration,
  type ResolvedAddress,
} from "@parmana/shared";
import { MemoryBusinessSignalSourceRepository } from "@parmana/storage";

import {
  HttpBusinessSignalSource,
  RepositoryBusinessSignalSourceRegistry,
  type BusinessSignalAnswerMessage,
  type SignedBusinessSignalQuery,
} from "../../src/business-sources/HttpBusinessSignalSource.js";

import { createSignalSourceHandler } from "../../../../typescript/examples/08-business-signal-source.js";

/**
 * The HTTP business signal source (RFC-0023 phase 2): what Parmana sends,
 * and which answers it trusts. No network: DNS and the transport are
 * stubs, and the business system is a function.
 */

const ENDPOINT = "https://orders.example.com/parmana/signals";
const NOW = new Date("2026-10-10T12:00:00.000Z");
const serializer = new CanonicalSerializer();

const parmanaKeys = generateKeyPairSync("ed25519");
const signatureProvider = CryptoBootstrap.create().signature;
const parmanaSigner: Signer = {
  sign: (_keyId, data) => signatureProvider.sign(data, parmanaKeys.privateKey),
  getPublicKey: async () => parmanaKeys.publicKey,
  getMetadata: async (keyId) => ({ keyId, algorithm: "ed25519" as never }),
  hasKey: async () => true,
};

const sourceKeys = generateKeyPairSync("ed25519");
const sourcePublicKeyPem = sourceKeys.publicKey
  .export({ format: "pem", type: "spki" })
  .toString();

const publicLookup = async (): Promise<readonly ResolvedAddress[]> => [
  { address: "203.0.114.10", family: 4 },
];

const QUERY = {
  signalKey: "invoicePaid",
  claim: "invoice.paid",
  subject: "INV-1001",
  subjectPath: "parameters.invoiceId",
  action: "erp:release-goods",
  businessTransactionId: "btx-1",
};

function registration(
  overrides: Partial<BusinessSignalSourceRegistration> = {},
): BusinessSignalSourceRegistration {
  return {
    registrationId: "reg-1",
    name: "erp",
    endpointUrl: ENDPOINT,
    timeoutMs: 5_000,
    status: "active",
    registeredAt: NOW,
    ...overrides,
  };
}

function signAnswer(
  answer: BusinessSignalAnswerMessage,
  privateKey = sourceKeys.privateKey,
): string {
  return crypto
    .sign(null, Buffer.from(serializer.serialize(answer)), privateKey)
    .toString("base64");
}

type Respond = (
  query: SignedBusinessSignalQuery["query"],
) => { status?: number; body: unknown } | { status?: number; raw: string };

/**
 * A business system as the docs tell an operator to build one: it
 * checks Parmana's signature and audience, then answers about the
 * subject from its own records.
 */
function businessSystem(respond: Respond) {
  const received: Array<{
    url: string;
    timeoutMs: number;
    signed: SignedBusinessSignalQuery;
  }> = [];

  const transport: ReleaseTransport = async ({
    url,
    addresses,
    body,
    timeoutMs,
  }) => {
    expect(addresses).toEqual([{ address: "203.0.114.10", family: 4 }]);

    const signed = JSON.parse(body) as SignedBusinessSignalQuery;
    received.push({ url: url.href, timeoutMs, signed });

    const verified = crypto.verify(
      null,
      Buffer.from(serializer.serialize(signed.query)),
      parmanaKeys.publicKey,
      Buffer.from(signed.signature.value, "base64"),
    );

    if (!verified || signed.query.audience !== ENDPOINT) {
      return { status: 401, body: "{}" };
    }

    const reply = respond(signed.query);

    return {
      status: reply.status ?? 200,
      body: "raw" in reply ? reply.raw : JSON.stringify(reply.body),
    };
  };

  return { transport, received };
}

function answerTo(
  query: SignedBusinessSignalQuery["query"],
  overrides: Partial<BusinessSignalAnswerMessage> = {},
): BusinessSignalAnswerMessage {
  return {
    version: 1,
    source: query.source,
    nonce: query.nonce,
    signalKey: query.signalKey,
    claim: query.claim,
    subject: query.subject,
    status: "observed",
    value: true,
    observedAt: new Date(NOW.getTime() - 2_000).toISOString(),
    ...overrides,
  };
}

function source(
  respond: Respond,
  overrides: Partial<BusinessSignalSourceRegistration> = {},
) {
  const system = businessSystem(respond);

  return {
    system,
    source: new HttpBusinessSignalSource(registration(overrides), {
      signer: parmanaSigner,
      keyId: "default",
      lookup: publicLookup,
      transport: system.transport,
      now: () => NOW,
    }),
  };
}

describe("HttpBusinessSignalSource", () => {
  it("sends a signed query for exactly this fact, and returns an unsigned source's answer unverified", async () => {
    const { source: http, system } = source((query) => ({
      body: { answer: answerTo(query) },
    }));

    const answer = await http.resolve(QUERY);

    expect(system.received).toHaveLength(1);
    const [{ url, timeoutMs, signed }] = system.received;
    expect(url).toBe(ENDPOINT);
    expect(timeoutMs).toBe(5_000);
    expect(signed.signature).toMatchObject({
      algorithm: "ed25519",
      keyId: "default",
    });
    expect(signed.query).toMatchObject({
      version: 1,
      source: "erp",
      audience: ENDPOINT,
      signalKey: "invoicePaid",
      claim: "invoice.paid",
      subject: "INV-1001",
      action: "erp:release-goods",
      businessTransactionId: "btx-1",
      issuedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    });

    expect(answer).toEqual({
      kind: "observed",
      value: true,
      sourceIdentity: ENDPOINT,
      observedAt: new Date(NOW.getTime() - 2_000),
    });
  });

  it("uses a fresh nonce for every query", async () => {
    const { source: http, system } = source((query) => ({
      body: { answer: answerTo(query) },
    }));

    await http.resolve(QUERY);
    await http.resolve(QUERY);

    expect(system.received[0]?.signed.query.nonce).not.toBe(
      system.received[1]?.signed.query.nonce,
    );
  });

  it("verifies a registered source's signature and marks the proof verified", async () => {
    const { source: http } = source(
      (query) => {
        const answer = answerTo(query, {
          validUntil: new Date(NOW.getTime() + 30_000).toISOString(),
        });
        return {
          body: {
            answer,
            signature: {
              algorithm: "ed25519",
              keyId: "erp-2026",
              value: signAnswer(answer),
            },
          },
        };
      },
      { publicKeyPem: sourcePublicKeyPem, keyId: "erp-2026" },
    );

    const answer = await http.resolve(QUERY);

    expect(answer).toMatchObject({
      kind: "observed",
      value: true,
      validUntil: new Date(NOW.getTime() + 30_000),
      sourceKeyId: "erp-2026",
      sourceProofVerified: true,
    });
    expect(answer.kind === "observed" && answer.sourceProof).toMatch(
      /^[A-Za-z0-9+/]+=*$/,
    );
  });

  it("passes not_found and conflicting through, still checking the signature", async () => {
    for (const status of ["not_found", "conflicting"] as const) {
      const { source: http } = source(
        (query) => {
          const answer = answerTo(query, {
            status,
            value: undefined,
            observedAt: undefined,
            reason: "no such invoice",
          });
          return {
            body: {
              answer,
              signature: { algorithm: "ed25519", value: signAnswer(answer) },
            },
          };
        },
        { publicKeyPem: sourcePublicKeyPem },
      );

      expect(await http.resolve(QUERY)).toEqual({
        kind: status,
        reason: "no such invoice",
      });
    }
  });

  it.each<[string, Respond, Partial<BusinessSignalSourceRegistration>]>([
    ["a status other than 200", () => ({ status: 500, body: {} }), {}],
    ["a body that is not JSON", () => ({ raw: "<html>" }), {}],
    ["no answer object", () => ({ body: { value: true } }), {}],
    [
      "an answer to another nonce",
      (query) => ({ body: { answer: answerTo(query, { nonce: "other" }) } }),
      {},
    ],
    [
      "an answer about another subject",
      (query) => ({ body: { answer: answerTo(query, { subject: "INV-2" }) } }),
      {},
    ],
    [
      "an answer for another source",
      (query) => ({ body: { answer: answerTo(query, { source: "crm" }) } }),
      {},
    ],
    [
      "another protocol version",
      (query) => ({
        body: { answer: { ...answerTo(query), version: 2 } },
      }),
      {},
    ],
    [
      "an unknown status",
      (query) => ({
        body: { answer: answerTo(query, { status: "maybe" as never }) },
      }),
      {},
    ],
    [
      "an observed answer with no value",
      (query) => ({ body: { answer: answerTo(query, { value: undefined }) } }),
      {},
    ],
    [
      "an observed answer with no valid observedAt",
      (query) => ({
        body: { answer: answerTo(query, { observedAt: "yesterday" }) },
      }),
      {},
    ],
    [
      "an invalid validUntil",
      (query) => ({
        body: { answer: answerTo(query, { validUntil: "soon" }) },
      }),
      {},
    ],
    [
      "no signature from a source registered with a key",
      (query) => ({ body: { answer: answerTo(query) } }),
      { publicKeyPem: sourcePublicKeyPem },
    ],
    [
      "a signature by another key",
      (query) => {
        const answer = answerTo(query);
        return {
          body: {
            answer,
            signature: {
              algorithm: "ed25519",
              value: signAnswer(
                answer,
                generateKeyPairSync("ed25519").privateKey,
              ),
            },
          },
        };
      },
      { publicKeyPem: sourcePublicKeyPem },
    ],
    [
      "a signature over a different answer",
      (query) => {
        const answer = answerTo(query);
        return {
          body: {
            answer: { ...answer, value: false },
            signature: { algorithm: "ed25519", value: signAnswer(answer) },
          },
        };
      },
      { publicKeyPem: sourcePublicKeyPem },
    ],
    [
      "a signature naming another key id",
      (query) => {
        const answer = answerTo(query);
        return {
          body: {
            answer,
            signature: {
              algorithm: "ed25519",
              keyId: "erp-old",
              value: signAnswer(answer),
            },
          },
        };
      },
      { publicKeyPem: sourcePublicKeyPem, keyId: "erp-2026" },
    ],
    [
      "a signature with another algorithm",
      (query) => {
        const answer = answerTo(query);
        return {
          body: {
            answer,
            signature: { algorithm: "hmac", value: signAnswer(answer) },
          },
        };
      },
      { publicKeyPem: sourcePublicKeyPem },
    ],
  ])("refuses %s", async (_label, respond, overrides) => {
    const { source: http } = source(respond, overrides);

    await expect(http.resolve(QUERY)).rejects.toThrow();
  });

  it("refuses an endpoint that now resolves to a private address, before sending anything", async () => {
    const system = businessSystem((query) => ({
      body: { answer: answerTo(query) },
    }));
    const http = new HttpBusinessSignalSource(registration(), {
      signer: parmanaSigner,
      lookup: async () => [{ address: "10.0.0.7", family: 4 }],
      transport: system.transport,
      now: () => NOW,
    });

    await expect(http.resolve(QUERY)).rejects.toThrow(/not public/);
    expect(system.received).toHaveLength(0);
  });

  it("refuses to be built for an endpoint Parmana will not query", () => {
    expect(
      () =>
        new HttpBusinessSignalSource(
          registration({ endpointUrl: "http://orders.example.com/s" }),
        ),
    ).toThrow(/will not query/);
  });
});

describe("Registered sources through the resolver", () => {
  const POLICY: Policy = {
    policyId: "erp-release-goods",
    policyVersion: "1.0.0",
    schemaVersion: "1.0.0",
    signalsSchema: { invoicePaid: "boolean" },
    signalSources: {
      invoicePaid: {
        source: "erp",
        claim: "invoice.paid",
        subject: "parameters.invoiceId",
        maxAgeSeconds: 60,
      },
    },
    rules: [
      {
        id: "reject-unpaid",
        condition: { fact: "invoicePaid", operator: "eq", value: false },
        outcome: { action: PolicyAction.REJECT, reason: "unpaid" },
      },
    ],
  };

  async function registered(
    repository: MemoryBusinessSignalSourceRepository,
    action: "register" | "revoke",
  ): Promise<void> {
    const changeId = crypto.randomUUID();

    await repository.createChange({
      changeId,
      action,
      name: "erp",
      ...(action === "register" && {
        endpointUrl: ENDPOINT,
        timeoutMs: 5_000,
        publicKeyPem: sourcePublicKeyPem,
        keyId: "erp-2026",
      }),
      reason: "Test.",
      proposedBy: "maker",
      proposedAt: NOW,
      status: PendingPolicyChangeStatus.PENDING_APPROVAL,
    });
    await repository.approveChange(changeId, "checker", NOW);
  }

  function resolve(
    repository: MemoryBusinessSignalSourceRepository,
    transport: ReleaseTransport,
  ) {
    return new TrustedSignalResolver(
      new RepositoryBusinessSignalSourceRegistry(repository, {
        signer: parmanaSigner,
        lookup: publicLookup,
        transport,
        now: () => NOW,
      }),
      { now: () => NOW, newId: () => "signal-1" },
    ).resolve({
      policy: POLICY,
      action: "erp:release-goods",
      businessTransactionId: "btx-1",
      intent: { parameters: { invoiceId: "INV-1001" } },
      proposedSignals: { invoicePaid: true },
    });
  }

  const signedPaid: Respond = (query) => {
    const answer = answerTo(query);
    return {
      body: {
        answer,
        signature: {
          algorithm: "ed25519",
          keyId: "erp-2026",
          value: signAnswer(answer),
        },
      },
    };
  };

  it("records a Trusted Signal whose source proof Parmana verified", async () => {
    const repository = new MemoryBusinessSignalSourceRepository();
    await registered(repository, "register");

    const { assessment, trustedValues } = await resolve(
      repository,
      businessSystem(signedPaid).transport,
    );

    expect(assessment.status).toBe(BusinessValidationStatus.VALID);
    expect(trustedValues).toEqual({ invoicePaid: true });
    expect(assessment.signals?.[0]).toMatchObject({
      source: "erp",
      sourceIdentity: ENDPOINT,
      subject: "INV-1001",
      observedValue: true,
      integrityProof: {
        algorithm: "sha256",
        sourceKeyId: "erp-2026",
        sourceProofVerified: true,
      },
    });
  });

  it("is SOURCE_UNAVAILABLE when the answer's signature fails, and after a revoke", async () => {
    const repository = new MemoryBusinessSignalSourceRepository();
    await registered(repository, "register");

    const forged = await resolve(
      repository,
      businessSystem((query) => ({
        body: {
          answer: answerTo(query),
          signature: {
            algorithm: "ed25519",
            value: signAnswer(answerTo(query, { value: false })),
          },
        },
      })).transport,
    );
    expect(forged.assessment.status).toBe(
      BusinessValidationStatus.SOURCE_UNAVAILABLE,
    );
    expect(forged.trustedValues).toEqual({});

    await registered(repository, "revoke");

    const revoked = await resolve(
      repository,
      businessSystem(signedPaid).transport,
    );
    expect(revoked.assessment.status).toBe(
      BusinessValidationStatus.SOURCE_UNAVAILABLE,
    );
    expect(revoked.assessment.reason).toMatch(/not registered/);
  });

  it("is SOURCE_UNAVAILABLE when the registry cannot be read", async () => {
    const repository = new MemoryBusinessSignalSourceRepository();
    repository.findActive = async () => {
      throw new Error("database unavailable");
    };

    const { assessment } = await resolve(
      repository,
      businessSystem(signedPaid).transport,
    );

    expect(assessment.status).toBe(BusinessValidationStatus.SOURCE_UNAVAILABLE);
    expect(assessment.reason).toMatch(/database unavailable/);
  });
});

describe("The documented source (typescript/examples/08-business-signal-source.ts)", () => {
  const sourcePrivateKeyPem = sourceKeys.privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();
  const parmanaPublicKeyPem = parmanaKeys.publicKey
    .export({ format: "pem", type: "spki" })
    .toString();

  /** Parmana's real client, posting to the example's handler. */
  function connect(
    handler: ReturnType<typeof createSignalSourceHandler>,
    overrides: Partial<BusinessSignalSourceRegistration> = {},
  ) {
    const statuses: number[] = [];
    const transport: ReleaseTransport = async ({ body }) => {
      const answer = await handler(JSON.parse(body));
      statuses.push(answer.status);
      return { status: answer.status, body: JSON.stringify(answer.body) };
    };

    return {
      statuses,
      source: new HttpBusinessSignalSource(
        registration({
          publicKeyPem: sourcePublicKeyPem,
          keyId: "erp-2026",
          ...overrides,
        }),
        {
          signer: parmanaSigner,
          lookup: publicLookup,
          transport,
          now: () => NOW,
        },
      ),
    };
  }

  function handler(
    options: Partial<Parameters<typeof createSignalSourceHandler>[0]> = {},
  ) {
    return createSignalSourceHandler({
      parmanaPublicKeyPem,
      audience: ENDPOINT,
      privateKeyPem: sourcePrivateKeyPem,
      keyId: "erp-2026",
      now: () => NOW,
      lookup: async (claim, subject) =>
        claim === "invoice.paid" && subject === "INV-1001"
          ? {
              status: "observed",
              value: true,
              observedAt: new Date(NOW.getTime() - 1_000),
            }
          : { status: "not_found", reason: `no ${claim} for ${subject}` },
      ...options,
    });
  }

  it("answers Parmana's signed query with an answer Parmana verifies", async () => {
    const { source: http } = connect(handler());

    expect(await http.resolve(QUERY)).toMatchObject({
      kind: "observed",
      value: true,
      sourceKeyId: "erp-2026",
      sourceProofVerified: true,
    });
    expect(await http.resolve({ ...QUERY, subject: "INV-404" })).toEqual({
      kind: "not_found",
      reason: "no invoice.paid for INV-404",
    });
  });

  it("refuses a query not signed by Parmana, or meant for another endpoint", async () => {
    const otherParmana = generateKeyPairSync("ed25519")
      .publicKey.export({ format: "pem", type: "spki" })
      .toString();

    const forged = connect(handler({ parmanaPublicKeyPem: otherParmana }));
    await expect(forged.source.resolve(QUERY)).rejects.toThrow(/HTTP 401/);

    const elsewhere = connect(
      handler({ audience: "https://other.example.com/parmana/signals" }),
    );
    await expect(elsewhere.source.resolve(QUERY)).rejects.toThrow(/HTTP 401/);
  });

  it("refuses an expired query, and the same query twice", async () => {
    const late = connect(
      handler({ now: () => new Date(NOW.getTime() + 61_000) }),
    );
    await expect(late.source.resolve(QUERY)).rejects.toThrow(/HTTP 401/);

    const handle = handler();
    const signed = { query: {} as Record<string, unknown>, signature: {} };
    const capture: ReleaseTransport = async ({ body }) => {
      Object.assign(signed, JSON.parse(body));
      const answer = await handle(JSON.parse(body));
      return { status: answer.status, body: JSON.stringify(answer.body) };
    };
    await new HttpBusinessSignalSource(
      registration({ publicKeyPem: sourcePublicKeyPem }),
      {
        signer: parmanaSigner,
        lookup: publicLookup,
        transport: capture,
        now: () => NOW,
      },
    ).resolve(QUERY);

    expect((await handle(signed)).status).toBe(401);
  });

  it("is refused by Parmana when it signs with a key other than the registered one", async () => {
    const { source: http } = connect(
      handler({
        privateKeyPem: generateKeyPairSync("ed25519")
          .privateKey.export({ format: "pem", type: "pkcs8" })
          .toString(),
      }),
    );

    await expect(http.resolve(QUERY)).rejects.toThrow(/does not verify/);
  });
});
