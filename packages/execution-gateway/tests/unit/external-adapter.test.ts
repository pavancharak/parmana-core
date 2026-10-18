import crypto, { generateKeyPairSync } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import type {
  ConnectorExecutionContext,
  ConnectorRequest,
} from "@parmana/connector-sdk";
import {
  CanonicalSerializer,
  CryptoBootstrap,
  type Signer,
} from "@parmana/crypto";
import type { ResolvedAddress } from "@parmana/shared";

import {
  EXTERNAL_RELEASE_TTL_MS,
  GatewayExternalAdapter,
  createPinnedHttpsTransport,
  type ReleaseTransport,
  type ReleaseTransportRequest,
  type SignedExternalRelease,
} from "../../src/connector-execution/GatewayExternalAdapter.js";

/**
 * The generic external connector (ADR-0013, step 2), with no network:
 * DNS is a function, the transport is a function, and the one test of
 * the real transport talks to a local server over plain HTTP.
 */

const ENDPOINT = "https://erp.example.com/parmana/release";
const keys = generateKeyPairSync("ed25519");
// The server's own signature provider (Ed25519 in tests), as the
// production LocalFileSigner uses it.
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
  capability: "erp:create-invoice",
  businessTransactionId: "bt-42",
  action: "erp:create-invoice",
  target: "customer-42",
  parameters: { amount: 1200, currency: "INR" },
};

const context: ConnectorExecutionContext = {
  credential: {} as never,
  timeoutMs: 30_000,
  requestedAt: new Date(),
  release: {
    authorizationId: "auth-7",
    policy: { name: "erp-invoice", version: "1.0.0", contentHash: "c0ffee" },
    approvals: [
      { approverId: "manager-x", keyId: "manager-x-key-1", approvalId: "ap-1" },
    ],
  },
};

function answer(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    businessTransactionId: "bt-42",
    capability: "erp:create-invoice",
    success: true,
    result: { invoiceId: "INV-991" },
    executedAt: "2026-10-01T10:00:02.000Z",
    ...overrides,
  });
}

function adapter(
  transport: ReleaseTransport,
  overrides: Partial<
    ConstructorParameters<typeof GatewayExternalAdapter>[0]
  > = {},
) {
  return new GatewayExternalAdapter({
    target: {
      capability: "erp:create-invoice",
      endpointUrl: ENDPOINT,
      allowedParameters: ["amount", "currency"],
      timeoutMs: 10_000,
    },
    signer,
    lookup: publicLookup,
    transport,
    now: () => new Date("2026-10-01T10:00:00.000Z"),
    ...overrides,
  });
}

function recordingTransport(
  status = 200,
  body = answer(),
): ReleaseTransport & { calls: ReleaseTransportRequest[] } {
  const calls: ReleaseTransportRequest[] = [];
  const transport = (async (sent: ReleaseTransportRequest) => {
    calls.push(sent);
    return { status, body };
  }) as ReleaseTransport & { calls: ReleaseTransportRequest[] };
  transport.calls = calls;
  return transport;
}

describe("GatewayExternalAdapter: the signed release", () => {
  it("sends a release signed over its canonical JSON, with the endpoint as audience and a 60 second expiry", async () => {
    const transport = recordingTransport();

    const response = await adapter(transport).execute(request, context);

    expect(transport.calls).toHaveLength(1);
    const sent = JSON.parse(transport.calls[0]!.body) as SignedExternalRelease;

    expect(sent.release).toEqual({
      version: 1,
      connectorId: "ext-erp:create-invoice",
      audience: ENDPOINT,
      businessTransactionId: "bt-42",
      authorizationId: "auth-7",
      capability: "erp:create-invoice",
      target: "customer-42",
      parameters: { amount: 1200, currency: "INR" },
      policy: { name: "erp-invoice", version: "1.0.0", contentHash: "c0ffee" },
      approvedBy: [
        {
          approverId: "manager-x",
          keyId: "manager-x-key-1",
          approvalId: "ap-1",
        },
      ],
      issuedAt: "2026-10-01T10:00:00.000Z",
      expiresAt: "2026-10-01T10:01:00.000Z",
    });
    expect(
      Date.parse(sent.release.expiresAt) - Date.parse(sent.release.issuedAt),
    ).toBe(EXTERNAL_RELEASE_TTL_MS);
    expect(sent.signature).toMatchObject({
      algorithm: "ed25519",
      keyId: "default",
    });

    // Verified independently of Parmana's crypto package: plain Ed25519
    // over the canonical bytes, base64 signature. This is what the SDK
    // helpers (step 3) must check.
    const canonical = new CanonicalSerializer().serialize(sent.release);
    expect(
      crypto.verify(
        null,
        canonical,
        keys.publicKey,
        Buffer.from(sent.signature.value, "base64"),
      ),
    ).toBe(true);

    // A changed release no longer verifies.
    const tampered = new CanonicalSerializer().serialize({
      ...sent.release,
      audience: "https://other.example.com/release",
    });
    expect(
      crypto.verify(
        null,
        tampered,
        keys.publicKey,
        Buffer.from(sent.signature.value, "base64"),
      ),
    ).toBe(false);

    expect(response).toEqual({
      success: true,
      metadata: {
        endpointUrl: ENDPOINT,
        releaseIssuedAt: "2026-10-01T10:00:00.000Z",
        result: { invoiceId: "INV-991" },
        executedAt: "2026-10-01T10:00:02.000Z",
      },
    });
  });

  it("passes the checked addresses and the shorter timeout to the transport", async () => {
    const transport = recordingTransport();

    await adapter(transport).execute(request, { ...context, timeoutMs: 5000 });

    expect(transport.calls[0]).toMatchObject({
      addresses: [{ address: "203.0.114.10", family: 4 }],
      timeoutMs: 5000,
    });
    expect(transport.calls[0]!.url.href).toBe(ENDPOINT);
  });

  it("records an endpoint's signature on its answer as sent", async () => {
    const response = await adapter(
      recordingTransport(
        200,
        answer({ signature: { algorithm: "ed25519", value: "abc" } }),
      ),
    ).execute(request, context);

    expect(response.metadata?.endpointSignature).toEqual({
      algorithm: "ed25519",
      value: "abc",
    });
  });
});

describe("GatewayExternalAdapter: refused before anything is sent", () => {
  it("refuses a request with no signed authorization behind it", async () => {
    const transport = recordingTransport();
    const { release: _release, ...bare } = context;

    await expect(adapter(transport).execute(request, bare)).rejects.toThrow(
      /no signed authorization/,
    );
    expect(transport.calls).toHaveLength(0);
  });

  it("refuses a parameter the registration does not allow", async () => {
    const transport = recordingTransport();

    await expect(
      adapter(transport).execute(
        { ...request, parameters: { ...request.parameters, bankAccount: "x" } },
        context,
      ),
    ).rejects.toThrow(/"bankAccount"/);
    expect(transport.calls).toHaveLength(0);
  });

  it("refuses another capability", async () => {
    const transport = recordingTransport();

    await expect(
      adapter(transport).execute(
        { ...request, capability: "erp:void-invoice" },
        context,
      ),
    ).rejects.toThrow(/does not declare/);
    expect(transport.calls).toHaveLength(0);
  });

  it.each([
    ["a private address", ["10.0.0.7"]],
    ["the cloud metadata address", ["169.254.169.254"]],
    ["loopback behind a public address", ["203.0.114.10", "127.0.0.1"]],
  ])(
    "refuses when the host now resolves to %s (DNS changed after registration)",
    async (_label, addresses) => {
      const transport = recordingTransport();

      await expect(
        adapter(transport, {
          lookup: async () =>
            addresses.map((address) => ({ address, family: 4 as const })),
        }).execute(request, context),
      ).rejects.toThrow(/not public/);
      expect(transport.calls).toHaveLength(0);
    },
  );

  it("refuses a host that no longer resolves", async () => {
    const transport = recordingTransport();

    await expect(
      adapter(transport, {
        lookup: async () => {
          throw new Error("ENOTFOUND");
        },
      }).execute(request, context),
    ).rejects.toThrow(/does not resolve/);
    expect(transport.calls).toHaveLength(0);
  });

  it("will not be built for an endpoint the registration rules refuse", () => {
    for (const endpointUrl of [
      "http://erp.example.com/release",
      "https://10.0.0.7/release",
      "https://localhost/release",
    ]) {
      expect(() =>
        adapter(recordingTransport(), {
          target: {
            capability: "erp:create-invoice",
            endpointUrl,
            allowedParameters: [],
            timeoutMs: 10_000,
          },
        }),
      ).toThrow(/will not release/);
    }
  });
});

describe("GatewayExternalAdapter: the endpoint's answer", () => {
  it.each([
    ["HTTP 500", 500, answer(), /HTTP 500/],
    ["a redirect", 302, "", /HTTP 302/],
    ["a body that is not JSON", 200, "<html>", /not JSON/],
    ["a JSON array", 200, "[]", /not an object/],
    [
      "another businessTransactionId",
      200,
      answer({ businessTransactionId: "bt-other" }),
      /businessTransactionId does not match/,
    ],
    [
      "another capability",
      200,
      answer({ capability: "erp:void-invoice" }),
      /capability does not match/,
    ],
    [
      "success that is not a boolean",
      200,
      answer({ success: "yes" }),
      /success/,
    ],
    ["a missing result", 200, answer({ result: undefined }), /result is not/],
    ["a result array", 200, answer({ result: [1] }), /result is not/],
    [
      "a result over 16 KB",
      200,
      answer({ result: { blob: "x".repeat(17 * 1024) } }),
      /larger than 16384/,
    ],
    [
      "executedAt that is not a string",
      200,
      answer({ executedAt: 5 }),
      /executedAt/,
    ],
  ])("refuses %s", async (_label, status, body, message) => {
    await expect(
      adapter(recordingTransport(status, body)).execute(request, context),
    ).rejects.toThrow(message);
  });

  it("accepts success false as the endpoint's answer, not an error", async () => {
    const response = await adapter(
      recordingTransport(
        200,
        answer({ success: false, result: { reason: "closed" } }),
      ),
    ).execute(request, context);

    expect(response.success).toBe(false);
    expect(response.metadata?.result).toEqual({ reason: "closed" });
  });
});

describe("GatewayExternalAdapter: more edges", () => {
  it("forwards no parameter at all when the registration allows none", async () => {
    const transport = recordingTransport();

    await expect(
      adapter(transport, {
        target: {
          capability: "erp:create-invoice",
          endpointUrl: ENDPOINT,
          allowedParameters: [],
          timeoutMs: 10_000,
        },
      }).execute(request, context),
    ).rejects.toThrow(/allows only none/);
    expect(transport.calls).toHaveLength(0);

    await expect(
      adapter(recordingTransport(), {
        target: {
          capability: "erp:create-invoice",
          endpointUrl: ENDPOINT,
          allowedParameters: [],
          timeoutMs: 10_000,
        },
      }).execute({ ...request, parameters: {} }, context),
    ).resolves.toMatchObject({ success: true });
  });

  it("records only the known fields of an answer, whatever else the endpoint adds", async () => {
    const response = await adapter(
      recordingTransport(200, answer({ debug: { token: "x" }, note: "hi" })),
    ).execute(request, context);

    expect(Object.keys(response.metadata ?? {}).sort()).toEqual(
      ["endpointUrl", "executedAt", "releaseIssuedAt", "result"].sort(),
    );
  });

  it("uses the registration's timeout when it is shorter than the executor's", async () => {
    const transport = recordingTransport();

    await adapter(transport, {
      target: {
        capability: "erp:create-invoice",
        endpointUrl: ENDPOINT,
        allowedParameters: ["amount", "currency"],
        timeoutMs: 2_000,
      },
    }).execute(request, context);

    expect(transport.calls[0]?.timeoutMs).toBe(2_000);
  });
});

describe("createPinnedHttpsTransport", () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) =>
      server === undefined ? resolve() : server.close(() => resolve()),
    );
    server = undefined;
  });

  async function listen(handler: http.RequestListener): Promise<number> {
    server = http.createServer(handler);
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", () => resolve()),
    );
    return (server!.address() as AddressInfo).port;
  }

  function send(port: number, timeoutMs = 2000, maxResponseBytes?: number) {
    return createPinnedHttpsTransport({
      request: http.request,
      ...(maxResponseBytes !== undefined ? { maxResponseBytes } : {}),
    })({
      // A name that does not resolve anywhere: the connection can only
      // reach the server through the pinned address.
      url: new URL(
        `https://erp.parmana-test.invalid:${port}/parmana/release?x=1`,
      ),
      addresses: [{ address: "127.0.0.1", family: 4 }],
      body: '{"release":{}}',
      timeoutMs,
    });
  }

  it("connects to the pinned address, never resolving the host, and sends the body with the host name", async () => {
    const seen: { host?: string; url?: string; method?: string; body: string } =
      {
        body: "",
      };
    const port = await listen((incoming, outgoing) => {
      seen.host = incoming.headers.host;
      seen.url = incoming.url;
      seen.method = incoming.method;
      incoming.on("data", (chunk) => (seen.body += chunk));
      incoming.on("end", () => {
        outgoing.writeHead(200, { "Content-Type": "application/json" });
        outgoing.end('{"ok":true}');
      });
    });

    await expect(send(port)).resolves.toEqual({
      status: 200,
      body: '{"ok":true}',
    });
    expect(seen).toEqual({
      host: `erp.parmana-test.invalid:${port}`,
      url: "/parmana/release?x=1",
      method: "POST",
      body: '{"release":{}}',
    });
  });

  it("does not follow a redirect", async () => {
    let requests = 0;
    const port = await listen((_incoming, outgoing) => {
      requests += 1;
      outgoing.writeHead(302, { Location: "http://169.254.169.254/latest" });
      outgoing.end();
    });

    await expect(send(port)).resolves.toMatchObject({ status: 302 });
    expect(requests).toBe(1);
  });

  it("stops reading an answer larger than the limit", async () => {
    const port = await listen((_incoming, outgoing) => {
      outgoing.writeHead(200);
      outgoing.end("x".repeat(4096));
    });

    await expect(send(port, 2000, 1024)).rejects.toThrow(/larger than 1024/);
  });

  it("gives up after the timeout", async () => {
    const port = await listen(() => {
      // Never answers.
    });

    await expect(send(port, 200)).rejects.toThrow(/within 200ms/);
  });

  it("refuses when there is no checked address", async () => {
    await expect(
      createPinnedHttpsTransport({ request: http.request })({
        url: new URL("https://erp.example.com/release"),
        addresses: [],
        body: "{}",
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/No checked address/);
  });
});

/**
 * Mutation testing found these unpinned: the single address branch of
 * the pinned lookup (Node asks for all addresses by default, so the
 * other branch never ran), the exact size limits, and which refusal a
 * malformed answer gets.
 */
describe("GatewayExternalAdapter: exact limits and refusals", () => {
  type Captured = { lookup?: (...args: unknown[]) => void };

  function capturingRequest(captured: Captured) {
    return ((options: Captured) => {
      captured.lookup = options.lookup;
      const fake = {
        on: () => fake,
        end: () => undefined,
        destroy: () => undefined,
      };
      return fake;
    }) as unknown as typeof http.request;
  }

  it("the pinned lookup answers with the checked address, whether one or all are asked for", () => {
    const captured: Captured = {};
    void createPinnedHttpsTransport({ request: capturingRequest(captured) })({
      url: new URL("https://erp.example.com/release"),
      addresses: [
        { address: "203.0.114.10", family: 4 },
        { address: "203.0.114.11", family: 4 },
      ],
      body: "{}",
      timeoutMs: 50,
    }).catch(() => undefined);

    const one: unknown[] = [];
    captured.lookup!("evil.example.com", {}, (...args: unknown[]) =>
      one.push(...args),
    );
    expect(one).toEqual([null, "203.0.114.10", 4]);

    const all: unknown[] = [];
    captured.lookup!("evil.example.com", { all: true }, (...args: unknown[]) =>
      all.push(...args),
    );
    expect(all).toEqual([null, [{ address: "203.0.114.10", family: 4 }]]);
  });

  it("connects to port 443 when the URL names none", () => {
    let port: unknown;
    const request = ((options: { port: unknown }) => {
      port = options.port;
      const fake = {
        on: () => fake,
        end: () => undefined,
        destroy: () => undefined,
      };
      return fake;
    }) as unknown as typeof http.request;

    void createPinnedHttpsTransport({ request })({
      url: new URL("https://erp.example.com/release"),
      addresses: [{ address: "203.0.114.10", family: 4 }],
      body: "{}",
      timeoutMs: 50,
    }).catch(() => undefined);

    expect(port).toBe(443);
  });

  describe("an answer of exactly the limit", () => {
    let server: http.Server | undefined;

    afterEach(async () => {
      await new Promise<void>((resolve) =>
        server === undefined ? resolve() : server.close(() => resolve()),
      );
      server = undefined;
    });

    it("is read in full", async () => {
      server = http.createServer((_incoming, outgoing) => {
        outgoing.writeHead(200);
        outgoing.end("x".repeat(1024));
      });
      await new Promise<void>((resolve) =>
        server!.listen(0, "127.0.0.1", () => resolve()),
      );
      const port = (server.address() as AddressInfo).port;

      const response = await createPinnedHttpsTransport({
        request: http.request,
        maxResponseBytes: 1024,
      })({
        url: new URL(`https://erp.parmana-test.invalid:${port}/release`),
        addresses: [{ address: "127.0.0.1", family: 4 }],
        body: "{}",
        timeoutMs: 2000,
      });

      expect(response.body).toHaveLength(1024);
    });
  });

  it("accepts a result of exactly 16 KB, refuses one byte more", async () => {
    // {"blob":"..."} is 11 bytes around the string.
    const exact = { blob: "x".repeat(16 * 1024 - 11) };
    const over = { blob: "x".repeat(16 * 1024 - 10) };

    await expect(
      adapter(recordingTransport(200, answer({ result: exact }))).execute(
        request,
        context,
      ),
    ).resolves.toMatchObject({ success: true });
    await expect(
      adapter(recordingTransport(200, answer({ result: over }))).execute(
        request,
        context,
      ),
    ).rejects.toThrow(/result is larger than 16384 bytes/);
  });

  it.each(["[]", "5", "null", '"text"'])(
    "refuses JSON %s as not an object, before reading any field",
    async (body) => {
      await expect(
        adapter(recordingTransport(200, body)).execute(request, context),
      ).rejects.toThrow(
        'External connector "ext-erp:create-invoice" endpoint answered with JSON that is not an object.',
      );
    },
  );

  it("records executedAt only when the endpoint sent one", async () => {
    const without = await adapter(
      recordingTransport(200, answer({ executedAt: undefined })),
    ).execute(request, context);
    expect(without.metadata).not.toHaveProperty("executedAt");

    const withIt = await adapter(recordingTransport()).execute(
      request,
      context,
    );
    expect(withIt.metadata).toMatchObject({
      executedAt: "2026-10-01T10:00:02.000Z",
    });
  });

  it("names the connector and the reason when an address is refused", async () => {
    await expect(
      adapter(recordingTransport(), {
        lookup: async () => [{ address: "10.0.0.1", family: 4 as const }],
      }).execute(request, context),
    ).rejects.toThrow(
      /^External connector "ext-erp:create-invoice" refuses to release: /,
    );
  });

  it("names every refused parameter", async () => {
    await expect(
      adapter(recordingTransport()).execute(
        { ...request, parameters: { amount: 1, iban: "x", note: "y" } },
        context,
      ),
    ).rejects.toThrow(
      'External connector "ext-erp:create-invoice" refuses to forward parameters "iban", "note": the registration allows only amount, currency.',
    );
    await expect(
      adapter(recordingTransport()).execute(
        { ...request, parameters: { iban: "x" } },
        context,
      ),
    ).rejects.toThrow('refuses to forward parameter "iban": the registration');
  });

  it("declares exactly its one capability", () => {
    expect(adapter(recordingTransport()).capabilities.declared).toEqual([
      "erp:create-invoice",
    ]);
  });
});

/**
 * G-83: the transport tries the next checked address when a connection
 * cannot be made, and never sends a release twice once one was made.
 * Two loopback addresses (127.0.0.1 and 127.0.0.2) share one port.
 */
describe("createPinnedHttpsTransport, several checked addresses (G-83)", () => {
  const servers: http.Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers
        .splice(0)
        .map(
          (server) =>
            new Promise<void>((resolve) => server.close(() => resolve())),
        ),
    );
  });

  async function listenOn(
    host: string,
    port: number,
    handler: http.RequestListener,
  ): Promise<number> {
    const server = http.createServer(handler);
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(port, host, () => resolve()),
    );
    return (server.address() as AddressInfo).port;
  }

  const sendTo = (port: number, hosts: string[]) =>
    createPinnedHttpsTransport({ request: http.request })({
      url: new URL(`https://erp.parmana-test.invalid:${port}/release`),
      addresses: hosts.map((address) => ({ address, family: 4 as const })),
      body: "{}",
      timeoutMs: 2000,
    });

  it("moves on to the next address when the first refuses the connection", async () => {
    const port = await listenOn("127.0.0.2", 0, (_incoming, outgoing) => {
      outgoing.writeHead(200);
      outgoing.end('{"ok":true}');
    });

    await expect(sendTo(port, ["127.0.0.1", "127.0.0.2"])).resolves.toEqual({
      status: 200,
      body: '{"ok":true}',
    });
  });

  it("never retries once a connection was made, so a release is sent once", async () => {
    let received = 0;
    const handler: http.RequestListener = (incoming) => {
      received += 1;
      incoming.socket.destroy();
    };
    const port = await listenOn("127.0.0.1", 0, handler);
    await listenOn("127.0.0.2", port, handler);

    await expect(sendTo(port, ["127.0.0.1", "127.0.0.2"])).rejects.toThrow();
    expect(received).toBe(1);
  });

  it("reports the last error when no address accepts a connection", async () => {
    const probe = await listenOn("127.0.0.3", 0, () => undefined);
    await new Promise<void>((resolve) => servers.pop()!.close(() => resolve()));

    await expect(sendTo(probe, ["127.0.0.1", "127.0.0.2"])).rejects.toThrow(
      /ECONNREFUSED/,
    );
  });
});
