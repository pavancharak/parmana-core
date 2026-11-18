/**
 * A fixture source adapter for policy version 2. TEST AND STAGING ONLY.
 *
 * It stands in for the accounts system. It answers from a fixed table of made-up invoices, signs each
 * answer with a key the caller supplies, and serves the same POST /answers contract as the real adapter
 * (see docs/internal/designs/ERP-INVOICE-PAY-SOURCE-BUILD.md). It never reads a real system, and no
 * production key may be given to it.
 */

import { randomBytes, type KeyObject } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import { policyV2 } from "@parmana/policy";

export interface FixtureInvoice {
  readonly amount: number;
  readonly vendorId: string;
  readonly vendorStatus: "active" | "blocked";
}

export interface FixtureSourceOptions {
  /** The source name registered in the register, for example "accounts". */
  readonly source: string;
  /** The key id the answers carry. */
  readonly keyId: string;
  /** The fixture's private key. Test keys only. */
  readonly privateKey: KeyObject;
  /** The bearer token the fixture checks. */
  readonly token: string;
  /** Subject (invoice id) to invoice. */
  readonly invoices: Readonly<Record<string, FixtureInvoice>>;
  /** Answers last this long after they are observed. Default 5 minutes. */
  readonly validMs?: number;
  readonly now?: () => Date;
}

/** Fixture claims, and the unit each one states. */
const CLAIMS = {
  "invoice.amount": { unit: "USD", read: (i: FixtureInvoice) => i.amount },
  "vendor.id": { unit: undefined, read: (i: FixtureInvoice) => i.vendorId },
  "vendor.status": {
    unit: undefined,
    read: (i: FixtureInvoice) => i.vendorStatus,
  },
} as const;

export interface FixtureQuery {
  readonly source: string;
  readonly claim: string;
  readonly subject: string;
  readonly action: string;
  readonly transactionId: string;
}

export class FixtureRefusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FixtureRefusal";
  }
}

function isQuery(value: unknown): value is FixtureQuery {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return ["source", "claim", "subject", "action", "transactionId"].every(
    (key) => typeof v[key] === "string" && (v[key] as string) !== "",
  );
}

/** Answers one query. Throws FixtureRefusal for a query it cannot answer. */
export function answerFixtureQuery(
  query: unknown,
  options: FixtureSourceOptions,
): policyV2.sourceAnswer.SignedAnswer {
  if (!isQuery(query)) throw new FixtureRefusal(400, "The query is not valid.");
  if (query.source !== options.source)
    throw new FixtureRefusal(404, "Unknown source.");
  if (!Object.prototype.hasOwnProperty.call(CLAIMS, query.claim)) {
    throw new FixtureRefusal(404, "Unknown claim.");
  }
  const invoice = Object.prototype.hasOwnProperty.call(
    options.invoices,
    query.subject,
  )
    ? options.invoices[query.subject]
    : undefined;
  if (invoice === undefined) throw new FixtureRefusal(404, "Unknown subject.");

  const claim = CLAIMS[query.claim as keyof typeof CLAIMS];
  const observedAt = (options.now ?? (() => new Date()))();
  const expiresAt = new Date(
    observedAt.getTime() + (options.validMs ?? 5 * 60 * 1000),
  );

  const payload: policyV2.sourceAnswer.AnswerPayload = {
    source: options.source,
    keyId: options.keyId,
    claim: query.claim,
    subject: query.subject,
    value: claim.read(invoice),
    ...(claim.unit !== undefined ? { unit: claim.unit } : {}),
    action: query.action,
    transactionId: query.transactionId,
    nonce: randomBytes(16).toString("hex"),
    observedAt: observedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  return policyV2.sourceAnswer.signAnswer(payload, options.privateKey);
}

/** The fixture as an HTTP server: POST /answers, with a bearer token. */
export function createFixtureSourceServer(
  options: FixtureSourceOptions,
): Server {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (request.method !== "POST" || request.url !== "/answers") {
      send(404, { error: "not_found" });
      return;
    }
    if (request.headers.authorization !== `Bearer ${options.token}`) {
      send(401, { error: "unauthorized" });
      return;
    }
    let raw = "";
    request.on("data", (chunk: Buffer) => {
      raw += chunk.toString("utf8");
    });
    request.on("end", () => {
      let query: unknown;
      try {
        query = JSON.parse(raw) as unknown;
      } catch {
        send(400, { error: "invalid_json" });
        return;
      }
      try {
        send(200, answerFixtureQuery(query, options));
      } catch (error) {
        if (error instanceof FixtureRefusal) {
          send(error.status, { error: error.message });
          return;
        }
        send(500, { error: "fixture_failed" });
      }
    });
  });
}
