/**
 * The demo's external connector endpoint, as a Vercel function: it
 * refunds a Razorpay payment, in test mode, only for a release Parmana
 * signed for this endpoint.
 *
 * Parmana holds no Razorpay credential. The endpoint holds the test-mode
 * keys (Vercel environment variables RAZORPAY_KEY_ID and
 * RAZORPAY_KEY_SECRET, added as sensitive) and acts only on the
 * capability, target (the payment id) and parameters.amount (paise) of a
 * verified release. Its answer is recorded in Parmana's signed record as
 * the endpoint's claim.
 *
 * build-endpoint.ts writes in the two public values: Parmana's public key
 * and this endpoint's own URL, the audience every release must name.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import { verifyParmanaRelease } from "@parmana/sdk";

import { createRefunder, type RefundOutcome } from "./razorpay.js";

export const CAPABILITY = "razorpay:refund";

export interface HandlerOptions {
  readonly publicKeyPem: string;
  readonly audience: string;
  readonly refund: (request: {
    paymentId: string;
    amount: number;
    receipt: string;
  }) => Promise<RefundOutcome>;
  readonly now?: () => Date;
}

/** Verifies a release body and refunds once. Returns status and JSON body. */
export function createHandler(options: HandlerOptions) {
  return async (
    body: unknown,
  ): Promise<{ status: number; body: Record<string, unknown> }> => {
    const verification = await verifyParmanaRelease(body, {
      publicKeys: { default: options.publicKeyPem },
      audience: options.audience,
      // Acting once is checked against Razorpay itself (a refund carrying
      // this businessTransactionId as its receipt), not against memory.
      isAlreadyExecuted: () => false,
      ...(options.now !== undefined ? { now: options.now() } : {}),
    });

    if (!verification.valid) {
      return { status: 401, body: { errors: [...verification.errors] } };
    }

    const { release } = verification;

    if (release.capability !== CAPABILITY) {
      return {
        status: 401,
        body: { errors: [`this endpoint serves only ${CAPABILITY}`] },
      };
    }

    const amount = release.parameters.amount;
    const outcome = await options.refund({
      paymentId: release.target,
      amount: typeof amount === "number" ? amount : Number.NaN,
      receipt: release.businessTransactionId,
    });

    console.log(
      JSON.stringify({
        event: outcome.success ? "refund_done" : "refund_failed",
        businessTransactionId: release.businessTransactionId,
        paymentId: release.target,
        amount,
        approvedBy: release.approvedBy.map((approval) => approval.approverId),
        result: outcome.result,
      }),
    );

    return {
      status: 200,
      body: {
        businessTransactionId: release.businessTransactionId,
        capability: release.capability,
        success: outcome.success,
        result: outcome.result,
        executedAt: new Date().toISOString(),
      },
    };
  };
}

let handle: ReturnType<typeof createHandler> | undefined;

function handler(): ReturnType<typeof createHandler> {
  handle ??= createHandler({
    publicKeyPem: process.env.PARMANA_PUBLIC_KEY_PEM ?? "",
    audience: process.env.ENDPOINT_URL ?? "",
    refund: createRefunder({
      keyId: process.env.RAZORPAY_KEY_ID ?? "",
      keySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
    }),
  });

  return handle;
}

export default async function vercelHandler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    response.writeHead(405).end();
    return;
  }

  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }

  let body: unknown;

  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    response
      .writeHead(400, { "Content-Type": "application/json" })
      .end(JSON.stringify({ errors: ["the body is not JSON"] }));
    return;
  }

  let answer: { status: number; body: Record<string, unknown> };

  try {
    answer = await handler()(body);
  } catch (error) {
    // Any failure here can come before or after Razorpay created the refund:
    // a live key or a missing secret stops before any call, but a timeout
    // after the POST may not. Parmana records the outcome as unknown, and a
    // resend of the same release returns the existing refund (the receipt
    // check), so the operator should resend rather than refund by hand.
    console.log(
      JSON.stringify({
        event: "endpoint_error",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    answer = {
      status: 500,
      body: { errors: ["refund outcome unknown; resend the same release"] },
    };
  }

  response
    .writeHead(answer.status, { "Content-Type": "application/json" })
    .end(JSON.stringify(answer.body));
}
