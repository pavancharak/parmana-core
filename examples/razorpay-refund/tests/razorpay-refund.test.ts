import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PolicyValidator } from "../../../packages/policy/src/index.js";
import { canonicalSerialize } from "../../../typescript/src/crypto/canonical.js";
import { CAPABILITY, createHandler } from "../endpoint.js";
import { assertTestMode, createRefunder } from "../razorpay.js";

const AUDIENCE = "https://parmana-razorpay-demo.example/api/refund";
const PAYMENT = "pay_TestPayment123";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey
  .export({ type: "spki", format: "pem" })
  .toString();

function signedRelease(changes: Record<string, unknown> = {}) {
  const now = Date.now();
  const release = {
    version: 1,
    connectorId: "razorpay-demo",
    audience: AUDIENCE,
    businessTransactionId: randomUUID(),
    authorizationId: randomUUID(),
    capability: CAPABILITY,
    target: PAYMENT,
    parameters: { amount: 100 },
    policy: { name: "razorpay-refund", version: "1.0.0" },
    approvedBy: [
      { approverId: "manager", keyId: "manager-1", approvalId: "a-1" },
    ],
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    ...changes,
  };
  const value = sign(
    null,
    Buffer.from(canonicalSerialize(release)),
    privateKey,
  );

  return {
    release,
    signature: {
      algorithm: "ed25519",
      keyId: "default",
      value: value.toString("base64"),
    },
  };
}

/** A fake Razorpay API: keeps refunds per payment, records every call. */
function fakeRazorpay(options: { failCreate?: boolean } = {}) {
  const refunds: Record<string, unknown>[] = [];
  const calls: { method: string; url: string; body?: unknown }[] = [];

  const fetchImpl = (async (url: string, init: RequestInit) => {
    const body =
      init.body === undefined ? undefined : JSON.parse(String(init.body));
    calls.push({ method: String(init.method), url, body });

    if (init.method === "GET") {
      return new Response(
        JSON.stringify({ entity: "collection", items: refunds }),
      );
    }

    if (options.failCreate) {
      return new Response(
        JSON.stringify({
          error: {
            code: "BAD_REQUEST_ERROR",
            description: "The amount is invalid",
          },
        }),
        { status: 400 },
      );
    }

    const refund = {
      id: `rfnd_${refunds.length + 1}`,
      payment_id: PAYMENT,
      amount: body.amount,
      receipt: body.receipt,
      status: "processed",
    };
    refunds.push(refund);

    return new Response(JSON.stringify(refund));
  }) as typeof fetch;

  return { fetchImpl, calls, refunds };
}

function endpoint(razorpay = fakeRazorpay()) {
  const handle = createHandler({
    publicKeyPem,
    audience: AUDIENCE,
    refund: createRefunder(
      { keyId: "rzp_test_abc", keySecret: "secret" },
      razorpay.fetchImpl,
    ),
  });

  return { handle, razorpay };
}

describe("Razorpay refund demo endpoint", () => {
  it("refunds a verified release once, with the businessTransactionId as receipt", async () => {
    const { handle, razorpay } = endpoint();
    const body = signedRelease();
    const answer = await handle(body);

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      businessTransactionId: body.release.businessTransactionId,
      capability: CAPABILITY,
      success: true,
      result: {
        paymentId: PAYMENT,
        amount: 100,
        alreadyRefunded: false,
        mode: "test",
      },
    });
    expect(razorpay.calls.map((call) => call.method)).toEqual(["GET", "POST"]);
    expect(razorpay.calls[1]?.body).toMatchObject({
      amount: 100,
      receipt: body.release.businessTransactionId,
    });
  });

  it("answers a repeated release from Razorpay's own record, without refunding again", async () => {
    const { handle, razorpay } = endpoint();
    const body = signedRelease();

    await handle(body);
    const again = await handle(body);

    expect(again.body).toMatchObject({
      success: true,
      result: { alreadyRefunded: true },
    });
    expect(razorpay.refunds).toHaveLength(1);
    expect(
      razorpay.calls.filter((call) => call.method === "POST"),
    ).toHaveLength(1);
  });

  it("refuses a release for another endpoint, a changed amount, or another capability, calling nothing", async () => {
    const { handle, razorpay } = endpoint();

    const other = await handle(
      signedRelease({ audience: "https://elsewhere.example/api/refund" }),
    );
    expect(other.status).toBe(401);

    const tampered = signedRelease();
    tampered.release.parameters = { amount: 50_000 };
    const changed = await handle(tampered);
    expect(changed.status).toBe(401);
    expect(changed.body.errors).toContain("the signature does not verify");

    const wrong = await handle(signedRelease({ capability: "paytm:refund" }));
    expect(wrong.status).toBe(401);

    expect(razorpay.calls).toHaveLength(0);
  });

  it("refuses an expired release", async () => {
    const { handle, razorpay } = endpoint();
    const old = signedRelease({
      issuedAt: new Date(Date.now() - 600_000).toISOString(),
      expiresAt: new Date(Date.now() - 300_000).toISOString(),
    });

    expect((await handle(old)).status).toBe(401);
    expect(razorpay.calls).toHaveLength(0);
  });

  it("reports Razorpay's refusal as success false, with its code", async () => {
    const { handle } = endpoint(fakeRazorpay({ failCreate: true }));
    const answer = await handle(signedRelease());

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      success: false,
      result: {
        stage: "create-refund",
        httpStatus: 400,
        code: "BAD_REQUEST_ERROR",
      },
    });
  });

  it("does not call Razorpay for a target that is not a payment id, or a bad amount", async () => {
    const { handle, razorpay } = endpoint();

    const notPayment = await handle(signedRelease({ target: "order_123" }));
    expect(notPayment.body).toMatchObject({
      success: false,
      result: { stage: "validate" },
    });

    const fraction = await handle(
      signedRelease({ parameters: { amount: 1.5 } }),
    );
    expect(fraction.body).toMatchObject({
      success: false,
      result: { stage: "validate" },
    });

    expect(razorpay.calls).toHaveLength(0);
  });

  it("refuses a live-mode key before making any call", () => {
    expect(() =>
      assertTestMode({ keyId: "rzp_live_abc", keySecret: "x" }),
    ).toThrow(/test mode/);
    expect(() =>
      createRefunder({ keyId: "rzp_live_abc", keySecret: "x" }),
    ).toThrow(/test mode/);
  });
});

describe("razorpay-refund policy", () => {
  const policy = JSON.parse(
    readFileSync(new URL("../policy.json", import.meta.url), "utf8"),
  );

  it("passes PolicyValidator, and requires a grant and a signed approval covering the amount", () => {
    expect(() => new PolicyValidator().validate(policy)).not.toThrow();
    expect(policy.requireAuthorityGrant).toBe(true);
    expect(policy.approvalSignals.managerApproved).toEqual({
      resourceId: "target",
      value: "parameters.amount",
    });
    expect(policy.boundSignals.refundAmount).toBe("parameters.amount");
  });

  it("would fail to load without the signed approval", () => {
    const { approvalSignals: _removed, ...withoutApproval } = policy;

    expect(() => new PolicyValidator().validate(withoutApproval)).toThrow(
      /signed human approval/,
    );
  });
});
