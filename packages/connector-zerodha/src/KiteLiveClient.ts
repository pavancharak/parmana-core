import { kiteAuthorizationHeader } from "./KiteSession.js";
import {
  validatePaperOrder,
  type PaperOrderRequest,
} from "./PaperKiteClient.js";
import { KITE_API_BASE_URL, KITE_API_VERSION } from "./ZerodhaCapabilities.js";

/**
 * Resolved Kite credentials for one order. Only the connector sees these; the
 * gateway hands over an opaque handle and the adapter reads its value.
 */
export interface KiteCredentials {
  readonly apiKey: string;
  readonly accessToken: string;
}

export function isKiteCredentials(value: unknown): value is KiteCredentials {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.apiKey === "string" &&
    candidate.apiKey.trim() !== "" &&
    typeof candidate.accessToken === "string" &&
    candidate.accessToken.trim() !== ""
  );
}

export interface KiteOrderResult {
  readonly orderId: string;
}

export interface KiteLiveClientOptions {
  /** Injected for tests. Defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;

  /** Per-request timeout. Defaults to 10 seconds. */
  readonly timeoutMs?: number;

  /** Must be HTTPS. Defaults to the Kite Connect v3 base URL. */
  readonly baseUrl?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function formFields(order: PaperOrderRequest): Record<string, string> {
  const fields: Record<string, string> = {
    tradingsymbol: order.tradingsymbol,
    exchange: order.exchange,
    transaction_type: order.transactionType,
    quantity: String(order.quantity),
    order_type: order.orderType,
    product: order.product,
    // Kite's documented default for regular orders (Kite Connect v3 orders page, 2026-10-28).
    validity: "DAY",
  };
  if (order.price !== undefined) {
    fields.price = String(order.price);
  }
  if (order.triggerPrice !== undefined) {
    fields.trigger_price = String(order.triggerPrice);
  }
  return fields;
}

function orderIdFrom(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const envelope = payload as { status?: unknown; data?: unknown };
  if (
    envelope.status !== "success" ||
    typeof envelope.data !== "object" ||
    envelope.data === null
  ) {
    return undefined;
  }
  const orderId = (envelope.data as { order_id?: unknown }).order_id;
  return typeof orderId === "string" && orderId !== "" ? orderId : undefined;
}

/**
 * Sends one order to the Kite Connect v3 order endpoint. It never retries:
 * an order request is not idempotent, so a retry could place the order twice.
 *
 * Any failure after the request was sent is reported as an error whose
 * outcome is unknown. The gateway turns a plain error after release into
 * EXECUTION_OUTCOME_UNKNOWN, so this client does not decide the outcome.
 */
export class KiteLiveClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(options: KiteLiveClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.baseUrl = options.baseUrl ?? KITE_API_BASE_URL;

    if (!this.baseUrl.startsWith("https://")) {
      throw new Error(
        "KiteLiveClient requires an HTTPS base URL. Refusing to send orders over plaintext.",
      );
    }

    Object.freeze(this);
  }

  async placeOrder(
    order: PaperOrderRequest,
    credentials: KiteCredentials,
  ): Promise<KiteOrderResult> {
    validatePaperOrder(order);

    // Kite v3 endpoint, header names, form field names, and response shape.
    // Re-verify against the current Kite Connect documentation before any live use.
    const url = `${this.baseUrl}/orders/${order.variety ?? "regular"}`;
    const body = new URLSearchParams(formFields(order)).toString();

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "X-Kite-Version": KITE_API_VERSION,
          Authorization: kiteAuthorizationHeader(
            credentials.apiKey,
            credentials.accessToken,
          ),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new Error(
        `Kite order request did not complete (${error instanceof Error ? error.name : "unknown error"}). ` +
          "The order may or may not have been placed.",
        { cause: error },
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(
        `Kite order response was not JSON (HTTP ${response.status}). The order outcome is unknown.`,
      );
    }

    const orderId = orderIdFrom(payload);
    if (!response.ok || orderId === undefined) {
      throw new Error(
        `Kite did not confirm the order (HTTP ${response.status}). The order outcome is unknown.`,
      );
    }
    return { orderId };
  }
}
