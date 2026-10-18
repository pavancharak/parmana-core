/**
 * The live check business signal source (RFC-0023 phases 2 and 4), as a
 * Vercel function.
 *
 * It is example 08's handler (typescript/examples/
 * 08-business-signal-source.ts) answering from a fixed demo table
 * instead of a real system, so the check reads no real record:
 *
 *   INV-LC-PAID    invoice.paid = true,  valid for 5 minutes
 *   INV-LC-UNPAID  invoice.paid = false
 *   anything else  not_found
 *
 * It verifies every query is signed by Parmana for this endpoint's own
 * URL, answers each nonce once, and signs every answer with its own
 * Ed25519 key. It logs one line per answer.
 *
 * build-endpoint.ts bundles this file, with three public values written
 * in: Parmana's public key, this endpoint's URL and its key id. The
 * private key is not in the bundle: it is the Vercel environment
 * variable SOURCE_PRIVATE_KEY_PEM, read when the function starts.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import {
  createSignalSourceHandler,
  type Fact,
} from "../../../typescript/examples/08-business-signal-source.js";

const VALID_FOR_MS = 5 * 60_000;

async function lookup(claim: string, subject: string): Promise<Fact> {
  if (claim !== "invoice.paid") {
    return {
      status: "not_found",
      reason: `this source does not serve ${claim}`,
    };
  }

  const now = new Date();

  switch (subject) {
    case "INV-LC-PAID":
      return {
        status: "observed",
        value: true,
        observedAt: now,
        validUntil: new Date(now.getTime() + VALID_FOR_MS),
      };
    case "INV-LC-UNPAID":
      return { status: "observed", value: false, observedAt: now };
    default:
      return { status: "not_found", reason: `no invoice ${subject}` };
  }
}

let handle: ReturnType<typeof createSignalSourceHandler> | undefined;

function handler(): ReturnType<typeof createSignalSourceHandler> {
  if (handle === undefined) {
    const privateKeyPem = process.env.SOURCE_PRIVATE_KEY_PEM;

    if (!privateKeyPem) {
      throw new Error("SOURCE_PRIVATE_KEY_PEM is not set.");
    }

    handle = createSignalSourceHandler({
      parmanaPublicKeyPem: process.env.PARMANA_PUBLIC_KEY_PEM ?? "",
      audience: process.env.ENDPOINT_URL ?? "",
      privateKeyPem: privateKeyPem.replace(/\\n/g, "\n"),
      ...(process.env.SOURCE_KEY_ID && { keyId: process.env.SOURCE_KEY_ID }),
      lookup,
    });
  }

  return handle;
}

export default async function respond(
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
      .end(JSON.stringify({ error: "the body is not JSON" }));
    return;
  }

  const { status, body: answer } = await handler()(body);
  const query = (body as { query?: Record<string, unknown> })?.query;
  const signed = (answer as { answer?: Record<string, unknown> }).answer;

  console.log(
    JSON.stringify(
      status === 200
        ? {
            event: "signal_answered",
            businessTransactionId: query?.businessTransactionId,
            claim: signed?.claim,
            subject: signed?.subject,
            status: signed?.status,
            value: signed?.value,
          }
        : { event: "signal_refused", httpStatus: status, error: answer.error },
    ),
  );

  response
    .writeHead(status, { "Content-Type": "application/json" })
    .end(JSON.stringify(answer));
}
