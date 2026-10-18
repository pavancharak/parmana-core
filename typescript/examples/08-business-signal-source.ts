/**
 * Example 08: a business signal source (RFC-0023).
 *
 * The HTTPS endpoint an operator registers as a business signal source,
 * for example an ERP named `erp`. When a policy declares a fact from
 * this source (`signalSources`), Parmana POSTs a signed query here: what
 * to establish (`claim`) about which business object (`subject`). The
 * endpoint checks the query came from Parmana and was meant for it,
 * reads the fact from its own records, never from the agent's request,
 * and answers with a signed answer that echoes the query.
 *
 * Run it:
 *
 *   PARMANA_PUBLIC_KEY_PEM="$(cat parmana-default.pem)" \
 *   ENDPOINT_URL=https://orders.example.com/parmana/signals \
 *   SOURCE_PRIVATE_KEY_PEM="$(cat erp-answers.private.pem)" \
 *   PORT=8080 npx tsx examples/08-business-signal-source.ts
 *
 * PARMANA_PUBLIC_KEY_PEM is the key from `client.publicKey("default")`.
 * ENDPOINT_URL is this endpoint's URL exactly as Parmana stored it at
 * registration (GET /business-signal-sources). SOURCE_PRIVATE_KEY_PEM is
 * the Ed25519 private key whose public half was registered as
 * `publicKeyPem`; it stays here. Serve it over HTTPS: Parmana asks only
 * https endpoints.
 */

import crypto from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { canonicalSerialize } from "@parmana/sdk";

/**
 * What Parmana sends: the query and its signature by Parmana's key.
 */
export interface SignalQuery {
  readonly version: 1;
  readonly source: string;
  readonly audience: string;
  readonly signalKey: string;
  readonly claim: string;
  readonly subject: string;
  readonly action: string;
  readonly businessTransactionId: string;
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

/**
 * What your records say about one claim for one subject.
 */
export type Fact =
  | {
      readonly status: "observed";
      readonly value: unknown;
      /** When your system established it. */
      readonly observedAt: Date;
      /** Until when it holds, if your system knows. */
      readonly validUntil?: Date;
    }
  | { readonly status: "not_found"; readonly reason: string }
  | { readonly status: "conflicting"; readonly reason: string };

export interface SignalSourceHandlerOptions {
  /**
   * Parmana's public key, PEM, from `client.publicKey("default")`.
   */
  readonly parmanaPublicKeyPem: string;

  /**
   * This endpoint's URL as registered.
   */
  readonly audience: string;

  /**
   * The Ed25519 private key the answers are signed with, PEM.
   */
  readonly privateKeyPem: string;

  /**
   * The keyId registered with the public key, if any.
   */
  readonly keyId?: string;

  /**
   * Reads the fact from your own records. Answer only claims you serve.
   */
  readonly lookup: (claim: string, subject: string) => Promise<Fact>;

  readonly now?: () => Date;
}

export interface SourceAnswer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/** How far ahead of this clock a query's issuedAt may be. */
const MAX_CLOCK_SKEW_MS = 60_000;

/**
 * The whole endpoint, independent of any HTTP framework: give it the
 * parsed JSON body, send back what it returns. Anything it cannot
 * verify gets 401 and no fact.
 */
export function createSignalSourceHandler(options: SignalSourceHandlerOptions) {
  const parmanaKey = crypto.createPublicKey(options.parmanaPublicKeyPem);
  const privateKey = crypto.createPrivateKey(options.privateKeyPem);
  const seenNonces = new Set<string>();

  const refuse = (reason: string): SourceAnswer => ({
    status: 401,
    body: { error: reason },
  });

  return async (body: unknown): Promise<SourceAnswer> => {
    const signed = body as {
      query?: SignalQuery;
      signature?: { algorithm?: string; value?: string };
    };
    const query = signed?.query;
    const now = (options.now ?? (() => new Date()))();

    if (
      typeof query !== "object" ||
      query === null ||
      typeof signed.signature?.value !== "string" ||
      signed.signature.algorithm !== "ed25519"
    ) {
      return refuse("not a signed Parmana query");
    }

    const authentic = crypto.verify(
      null,
      canonicalSerialize(query),
      parmanaKey,
      Buffer.from(signed.signature.value, "base64"),
    );

    if (!authentic) {
      return refuse("the query is not signed by Parmana");
    }

    if (query.version !== 1 || query.audience !== options.audience) {
      return refuse("the query is not meant for this endpoint");
    }

    if (
      Date.parse(query.expiresAt) <= now.getTime() ||
      Date.parse(query.issuedAt) > now.getTime() + MAX_CLOCK_SKEW_MS
    ) {
      return refuse("the query is not current");
    }

    // A query is answered once. Keep nonces until they expire; this
    // example keeps them in memory.
    if (seenNonces.has(query.nonce)) {
      return refuse("the query was already answered");
    }
    seenNonces.add(query.nonce);

    const fact = await options.lookup(query.claim, query.subject);

    const answer = {
      version: 1,
      source: query.source,
      nonce: query.nonce,
      signalKey: query.signalKey,
      claim: query.claim,
      subject: query.subject,
      ...(fact.status === "observed"
        ? {
            status: "observed",
            value: fact.value,
            observedAt: fact.observedAt.toISOString(),
            ...(fact.validUntil !== undefined && {
              validUntil: fact.validUntil.toISOString(),
            }),
          }
        : { status: fact.status, reason: fact.reason }),
    };

    return {
      status: 200,
      body: {
        answer,
        signature: {
          algorithm: "ed25519",
          ...(options.keyId !== undefined && { keyId: options.keyId }),
          value: crypto
            .sign(null, canonicalSerialize(answer), privateKey)
            .toString("base64"),
        },
      },
    };
  };
}

/**
 * The records this example serves: whether an invoice is paid. Replace
 * it with a read from your system.
 */
const PAID_INVOICES = new Map<string, boolean>([
  ["INV-1001", true],
  ["INV-1002", false],
]);

async function lookupInvoice(claim: string, subject: string): Promise<Fact> {
  if (claim !== "invoice.paid") {
    return {
      status: "not_found",
      reason: `this source does not serve ${claim}`,
    };
  }

  const paid = PAID_INVOICES.get(subject);

  return paid === undefined
    ? { status: "not_found", reason: `no invoice ${subject}` }
    : { status: "observed", value: paid, observedAt: new Date() };
}

/**
 * Starts the endpoint when this file is run directly.
 */
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const parmanaPublicKeyPem = process.env.PARMANA_PUBLIC_KEY_PEM;
  const audience = process.env.ENDPOINT_URL;
  const privateKeyPem = process.env.SOURCE_PRIVATE_KEY_PEM;
  const port = Number(process.env.PORT ?? 8080);

  if (
    parmanaPublicKeyPem === undefined ||
    audience === undefined ||
    privateKeyPem === undefined
  ) {
    console.error(
      "Set PARMANA_PUBLIC_KEY_PEM, ENDPOINT_URL and SOURCE_PRIVATE_KEY_PEM.",
    );
    process.exit(2);
  }

  const handle = createSignalSourceHandler({
    parmanaPublicKeyPem,
    audience,
    privateKeyPem,
    ...(process.env.SOURCE_KEY_ID !== undefined && {
      keyId: process.env.SOURCE_KEY_ID,
    }),
    lookup: lookupInvoice,
  });

  createServer((request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }

    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      let body: unknown;

      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "the body is not JSON" }));
        return;
      }

      void handle(body).then(({ status, body: answer }) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(answer));
      });
    });
  }).listen(port, () => {
    console.log(`Business signal source for ${audience} on port ${port}`);
  });
}
