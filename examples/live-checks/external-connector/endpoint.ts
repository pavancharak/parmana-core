/**
 * The live check endpoint for ADR-0013 step 6, as a Vercel function.
 *
 * It is example 07's release handler (typescript/examples/
 * 07-external-connector-endpoint.ts) with an action that changes
 * nothing: it answers with a receipt naming what the verified release
 * asked for, and logs one line per release, so the check has no side
 * effect anywhere.
 *
 * build-endpoint.ts bundles this file, with the SDK from this
 * repository and the two values below written in, into one file
 * Vercel can serve with no install step and no environment variable.
 * Both values are public: Parmana's public key, and this endpoint's
 * own URL.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import { createReleaseHandler } from "../../../typescript/examples/07-external-connector-endpoint.js";

const handle = createReleaseHandler({
  publicKeys: { default: process.env.PARMANA_PUBLIC_KEY_PEM ?? "" },
  audience: process.env.ENDPOINT_URL ?? "",
  act: async (release) => {
    console.log(
      JSON.stringify({
        event: "release_acted",
        businessTransactionId: release.businessTransactionId,
        authorizationId: release.authorizationId,
        capability: release.capability,
        target: release.target,
        policy: release.policy,
        approvedBy: release.approvedBy,
        // RFC-0023 phase 4: the business facts the release rests on,
        // absent when the decision sourced none.
        conditions: release.conditions,
      }),
    );

    return {
      receiptId: `RC-${release.businessTransactionId.slice(0, 8)}`,
      target: release.target,
      parameters: release.parameters,
    };
  },
});

export default async function handler(
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

  const { status, body: answer } = await handle(body);

  if (status !== 200) {
    console.log(
      JSON.stringify({ event: "release_refused", errors: answer.errors }),
    );
  }

  response
    .writeHead(status, { "Content-Type": "application/json" })
    .end(JSON.stringify(answer));
}
