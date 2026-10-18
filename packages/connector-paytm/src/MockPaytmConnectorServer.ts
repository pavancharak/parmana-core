import { verify } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import { SignerBootstrap } from "@parmana/crypto";

import { PAYTM_AGENT_WIRE_ACTION } from "./PaytmCapabilities.js";
import { canonicalPaytmAuthorizationString } from "./PaytmTypes.js";

export interface MockPaytmConnectorServerOptions {
  readonly sharedSecret: string;
}

interface ReceivedRequest {
  readonly businessTransactionId: unknown;
  readonly action: unknown;
  readonly target: unknown;
  readonly parameters: Record<string, unknown>;
}

/**
 * Local, in-memory stand-in for the REAL parmana-paytm-agent connector
 * service's POST /connector/paytm-refund endpoint (see that repository's
 * src/server/index.ts, executeAuthorizedConnectorRequest -- this mock's
 * request parsing/validation deliberately mirrors that function's exact
 * logic and error messages, verified against the real source, not
 * invented independently).
 *
 * Hermetic and deterministic -- never makes or receives real network
 * traffic beyond localhost, and never talks to Paytm's real
 * /refund/apply endpoint. GatewayPaytmAdapter's own tests and the
 * paytm-refund integration suite point PAYTM_CONNECTOR_URL at this
 * server instead of a real deployment.
 *
 * Real wire contract (NOT the flattened ConnectorRequest -- see
 * docs/connectors/PAYTM_CONNECTOR.md for why):
 *
 *   POST /connector/paytm-refund
 *   Authorization: Bearer <PAYTM_CONNECTOR_SHARED_SECRET>
 *   {
 *     "transaction": {
 *       "businessTransactionId": "...",
 *       "intent": {
 *         "action": "paytm-refund",
 *         "target": "...",
 *         "parameters": { "orderId", "txnId", "refId", "amount" }
 *       }
 *     },
 *     "authorization": { "payload": { "businessTransactionId": "...", "grantedCapability"?: "paytm-refund" } }
 *   }
 *
 * Response: { businessTransactionId, action, target, parameters, success, executedAt, metadata }
 * -- no "status" enum; only a boolean `success` plus whatever raw
 * result code/status is placed in `metadata`.
 */
export class MockPaytmConnectorServer {
  private server: Server | undefined;
  private baseUrlValue = "";
  private responseDelayMs = 0;
  private forcedResultStatus: string | undefined;
  private forcedHttpStatus: number | undefined;
  private malformed = false;
  private responseFieldOverride: Readonly<Record<string, unknown>> = {};
  private readonly receivedRequests: ReceivedRequest[] = [];
  private paytmInvocations = 0;

  constructor(private readonly options: MockPaytmConnectorServerOptions) {}

  get baseUrl(): string {
    return this.baseUrlValue;
  }

  /** Number of times this mock would have forwarded a refund on to Paytm's real API (a resultStatus of S/SUCCESS). */
  get paytmInvocationCount(): number {
    return this.paytmInvocations;
  }

  get calls(): readonly ReceivedRequest[] {
    return this.receivedRequests;
  }

  /** Test-only hook: delays every response, used to exercise the connector's own timeout handling. */
  setResponseDelayMs(delayMs: number): void {
    this.responseDelayMs = delayMs;
  }

  /** Forces the next (and subsequent) responses to report this raw Paytm resultStatus. Defaults to "S" (success). */
  setForcedResultStatus(resultStatus: string | undefined): void {
    this.forcedResultStatus = resultStatus;
  }

  /** Forces a non-2xx HTTP response, simulating a connector-service-side failure. */
  setForcedHttpStatus(status: number | undefined): void {
    this.forcedHttpStatus = status;
  }

  /** Returns a response body that fails PaytmAgentRefundExecutionResult's shape entirely. */
  setMalformedResponse(malformed: boolean): void {
    this.malformed = malformed;
  }

  /**
   * Overrides one or more fields in the next well-formed response
   * (businessTransactionId, action, target, or nested parameters.*) so
   * a test can simulate a response that does not correspond to the
   * request it was sent for.
   */
  setResponseFieldOverride(override: Readonly<Record<string, unknown>>): void {
    this.responseFieldOverride = override;
  }

  async listen(): Promise<void> {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        this.respond(res, 500, {
          error: error instanceof Error ? error.message : "request failed",
        });
      });
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, "127.0.0.1", resolve),
    );
    const address = this.server!.address() as AddressInfo;
    this.baseUrlValue = `http://127.0.0.1:${address.port}`;
  }

  async close(): Promise<void> {
    if (this.server === undefined) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!this.authenticates(req)) {
      this.respond(res, 401, { error: "unauthorized" });
      return;
    }

    const url = req.url ?? "";
    const method = req.method ?? "POST";
    const path = url.split("?")[0] ?? url;

    if (method !== "POST" || path !== "/connector/paytm-refund") {
      this.respond(res, 404, { error: "not_found" });
      return;
    }

    if (this.forcedHttpStatus !== undefined) {
      this.respond(res, this.forcedHttpStatus, { error: "forced failure" });
      return;
    }

    if (this.malformed) {
      this.respond(res, 200, { unexpected: "shape" });
      return;
    }

    const body = await this.readJsonBody(req);

    // Mirrors executeAuthorizedConnectorRequest's exact parse/validation
    // order and error messages (parmana-paytm-agent/src/server/index.ts).
    let transactionId: string;
    let action: string;
    let target: string;
    let orderId: string;
    let txnId: string;
    let refId: string;
    let amount: string;
    let reason: string | undefined;
    let expiresAt: number;
    let signatureB64: string;
    let keyId: string;

    try {
      const transaction = asRecord(body.transaction, "transaction");
      const intent = asRecord(transaction.intent, "transaction.intent");
      const authorization = asRecord(body.authorization, "authorization");
      const payload = asRecord(authorization.payload, "authorization.payload");
      const parameters = asRecord(
        intent.parameters,
        "transaction.intent.parameters",
      );

      action = String(intent.action ?? "");
      if (action !== PAYTM_AGENT_WIRE_ACTION)
        throw new Error("unsupported connector action");

      transactionId = String(transaction.businessTransactionId ?? "");
      if (!transactionId || payload.businessTransactionId !== transactionId) {
        throw new Error(
          "authorization is not bound to the business transaction",
        );
      }
      if (
        payload.grantedCapability !== undefined &&
        payload.grantedCapability !== action
      ) {
        throw new Error(
          "authorization capability does not match connector action",
        );
      }

      target = String(intent.target ?? "");
      orderId = requireParameter(parameters, "orderId");
      txnId = requireParameter(parameters, "txnId");
      refId = requireParameter(parameters, "refId");
      amount = requireParameter(parameters, "amount");
      // Optional since G-71: the refund comment the real service passes to Paytm.
      reason =
        typeof parameters.reason === "string" ? parameters.reason : undefined;

      // ADR-0009 Phase 2B: signature fields, mirroring the real
      // parmana-paytm-agent's own verification (added at the same
      // time as GatewayPaytmAdapter started sending them).
      expiresAt = Number(payload.expiresAt);
      if (!Number.isFinite(expiresAt)) {
        throw new Error("authorization.payload.expiresAt is required");
      }

      signatureB64 = String(authorization.signature ?? "");
      if (!signatureB64) {
        throw new Error("authorization.signature is required");
      }

      keyId = String(authorization.keyId ?? "");
      if (!keyId) {
        throw new Error("authorization.keyId is required");
      }
    } catch (error) {
      this.respond(res, 500, {
        error: error instanceof Error ? error.message : "request failed",
      });
      return;
    }

    // Everything from here on is also part of the "mirrors
    // executeAuthorizedConnectorRequest's exact parse/validation order"
    // contract this class documents: the real handler throws a plain
    // Error for every validation failure, uniformly surfaced as HTTP
    // 500 by its outer request handler -- signature failures are not
    // special-cased to a different status there, so this mock doesn't
    // invent one either.
    try {
      if (Date.now() > expiresAt) {
        throw new Error("authorization signature has expired");
      }

      const canonical = canonicalPaytmAuthorizationString({
        businessTransactionId: transactionId,
        action,
        orderId,
        txnId,
        amount,
        expiresAt,
      });

      const signer = await SignerBootstrap.create();
      const publicKey = await signer.getPublicKey(keyId);

      const signatureValid = verify(
        null,
        Buffer.from(canonical, "utf8"),
        publicKey,
        Buffer.from(signatureB64, "base64"),
      );

      if (!signatureValid) {
        throw new Error("authorization signature is invalid");
      }
    } catch (error) {
      this.respond(res, 500, {
        error: error instanceof Error ? error.message : "request failed",
      });
      return;
    }

    this.receivedRequests.push({
      businessTransactionId: transactionId,
      action,
      target,
      parameters: {
        orderId,
        txnId,
        refId,
        amount,
        ...(reason !== undefined ? { reason } : {}),
      },
    });

    const resultStatus = (this.forcedResultStatus ?? "S").toUpperCase();
    const success = resultStatus === "S" || resultStatus === "SUCCESS";

    if (success) this.paytmInvocations += 1;

    // Nested `parameters` overrides are merged (not replaced), so a
    // test can force a single mismatched field (e.g. orderId) without
    // having to restate every other real field.
    const { parameters: parametersOverride, ...topLevelOverride } = this
      .responseFieldOverride as {
      parameters?: Readonly<Record<string, unknown>>;
      [key: string]: unknown;
    };

    this.respond(res, 200, {
      businessTransactionId: transactionId,
      action,
      target,
      parameters: { orderId, txnId, refId, amount, ...parametersOverride },
      success,
      executedAt: new Date().toISOString(),
      metadata: {
        provider: "paytm",
        resultStatus: resultStatus || "UNKNOWN",
        resultCode: success ? "00" : "01",
      },
      ...topLevelOverride,
    });
  }

  private authenticates(req: IncomingMessage): boolean {
    const header = req.headers.authorization;
    if (header === undefined || !header.startsWith("Bearer ")) return false;
    return header.slice("Bearer ".length) === this.options.sharedSecret;
  }

  private async readJsonBody(
    req: IncomingMessage,
  ): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    if (raw.length === 0) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  }

  private respond(res: ServerResponse, status: number, body: unknown): void {
    setTimeout(() => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    }, this.responseDelayMs);
  }
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function requireParameter(
  parameters: Record<string, unknown>,
  field: string,
): string {
  const value = parameters[field];
  if (value === undefined || value === null || String(value).trim() === "")
    throw new Error(`${field} is required`);
  return String(value);
}
