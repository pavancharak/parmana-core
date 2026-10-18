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

import { verifyParmanaRelease } from "../../../../typescript/src/crypto/release.js";
import { createReleaseHandler } from "../../../../typescript/examples/07-external-connector-endpoint.js";

/**
 * RFC-0023 phase 4, "execute only if still valid": the signed release
 * carries the business conditions of its authorization, never outlives
 * the earliest one, and an endpoint that finds a condition no longer
 * holds answers conditionsNotMet, recorded as not acted on.
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

function context(
  conditions?: ConnectorExecutionContext["release"] extends infer R
    ? R extends { conditions?: infer C }
      ? C
      : never
    : never,
): ConnectorExecutionContext {
  return {
    credential: {} as never,
    timeoutMs: 30_000,
    requestedAt: NOW,
    release: {
      authorizationId: "auth-7",
      policy: { name: "release-goods", version: "1.0.0" },
      approvals: [],
      ...(conditions !== undefined && { conditions }),
    },
  };
}

function transport(
  reply: Record<string, unknown>,
): ReleaseTransport & { sent: SignedExternalRelease[] } {
  const sent: SignedExternalRelease[] = [];
  const send = (async (call: ReleaseTransportRequest) => {
    sent.push(JSON.parse(call.body));
    return {
      status: 200,
      body: JSON.stringify({
        businessTransactionId: "bt-7",
        capability: "erp:release-goods",
        result: {},
        ...reply,
      }),
    };
  }) as ReleaseTransport & { sent: SignedExternalRelease[] };
  send.sent = sent;
  return send;
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

describe("GatewayExternalAdapter: conditions (RFC-0023 phase 4)", () => {
  it("signs the conditions into the release, and expires it at the earliest validUntil", async () => {
    const send = transport({ success: true });

    await adapter(send).execute(request, context([CONDITION]));

    const [signed] = send.sent;
    expect(signed?.release.conditions).toEqual([CONDITION]);
    expect(signed?.release.expiresAt).toBe("2026-10-11T10:00:20.000Z");

    // The SDK verifier accepts it: the conditions are covered by the
    // signature, and it is refused after the earliest validUntil.
    const verify = (at: string) =>
      verifyParmanaRelease(signed, {
        publicKeys: { default: publicKeyPem },
        audience: ENDPOINT,
        isAlreadyExecuted: () => false,
        now: new Date(at),
        clockSkewSeconds: 0,
      });
    const before = await verify("2026-10-11T10:00:19.000Z");
    expect(before.valid).toBe(true);
    expect(before.valid && before.release.conditions).toEqual([CONDITION]);
    expect((await verify("2026-10-11T10:00:21.000Z")).valid).toBe(false);

    // Changing a condition breaks the signature.
    const tampered = {
      ...signed,
      release: {
        ...signed!.release,
        conditions: [{ ...CONDITION, value: false }],
      },
    };
    expect(
      (
        await verifyParmanaRelease(tampered, {
          publicKeys: { default: publicKeyPem },
          audience: ENDPOINT,
          isAlreadyExecuted: () => false,
          now: new Date("2026-10-11T10:00:19.000Z"),
        })
      ).valid,
    ).toBe(false);
  });

  it("keeps the 60 second expiry when the conditions last longer, and omits conditions when there are none", async () => {
    const send = transport({ success: true });

    await adapter(send).execute(
      request,
      context([{ ...CONDITION, validUntil: "2026-10-11T11:00:00.000Z" }]),
    );
    await adapter(send).execute(request, context());

    expect(send.sent[0]?.release.expiresAt).toBe("2026-10-11T10:01:00.000Z");
    expect(send.sent[1]?.release).not.toHaveProperty("conditions");
  });

  it("records conditionsNotMet as not acted on", async () => {
    const response = await adapter(
      transport({ success: false, conditionsNotMet: true }),
    ).execute(request, context([CONDITION]));

    expect(response.success).toBe(false);
    expect(response.metadata).toMatchObject({ conditionsNotMet: true });
  });

  it.each([
    ["with success true", { success: true, conditionsNotMet: true }],
    ["set to false", { success: false, conditionsNotMet: false }],
  ])("refuses conditionsNotMet %s", async (_label, reply) => {
    await expect(
      adapter(transport(reply)).execute(request, context([CONDITION])),
    ).rejects.toThrow(/conditionsNotMet/);
  });

  describe("against the documented endpoint (typescript/examples/07)", () => {
    function endpoint(hold: boolean) {
      const acted: string[] = [];
      const checked: unknown[] = [];
      const handle = createReleaseHandler({
        publicKeys: { default: publicKeyPem },
        audience: ENDPOINT,
        now: () => NOW,
        conditionsHold: async (conditions) => {
          checked.push(conditions);
          return hold;
        },
        act: async (release) => {
          acted.push(release.businessTransactionId);
          return { released: true };
        },
      });
      const send: ReleaseTransport = async (call) => {
        const answer = await handle(JSON.parse(call.body));
        return { status: answer.status, body: JSON.stringify(answer.body) };
      };
      return { send, acted, checked };
    }

    it("acts when the conditions still hold", async () => {
      const { send, acted, checked } = endpoint(true);

      const response = await adapter(send).execute(
        request,
        context([CONDITION]),
      );

      expect(response.success).toBe(true);
      expect(acted).toEqual(["bt-7"]);
      expect(checked).toEqual([[CONDITION]]);
    });

    it("does not act when a condition no longer holds, and Parmana records conditionsNotMet", async () => {
      const { send, acted } = endpoint(false);

      const response = await adapter(send).execute(
        request,
        context([CONDITION]),
      );

      expect(response.success).toBe(false);
      expect(response.metadata).toMatchObject({ conditionsNotMet: true });
      expect(acted).toEqual([]);
    });
  });
});
