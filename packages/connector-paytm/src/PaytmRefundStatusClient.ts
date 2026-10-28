/**
 * Read-only Paytm refund status lookup, through the trusted Paytm connector
 * service (parmana-paytm-agent, POST /connector/paytm-refund-status).
 *
 * Used to learn what Paytm recorded for a refund whose outcome is unknown
 * (G-125, Part 3 reconciliation). It never initiates or changes a refund.
 * Like every call to the connector service, it authenticates with the
 * connector shared secret, and only over HTTPS unless the endpoint is local.
 */

export const PAYTM_REFUND_STATUS_PATH = "/connector/paytm-refund-status";

const DEFAULT_TIMEOUT_MS = 10_000;

export interface PaytmRefundStatusLookup {
  readonly orderId: string;
  readonly refId: string;
}

export interface PaytmRefundStatusResult {
  readonly provider: "paytm";
  readonly resultStatus: string;
  readonly resultCode: string | null;
  readonly resultMessage: string | null;
}

export interface PaytmRefundStatusClientOptions {
  readonly baseUrl: string;
  readonly sharedSecret: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

function assertSecureEndpoint(baseUrl: string): void {
  const url = new URL(baseUrl);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error(
      "Paytm refund status lookup requires an https endpoint, except for localhost.",
    );
  }
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export async function lookupPaytmRefundStatus(
  options: PaytmRefundStatusClientOptions,
  lookup: PaytmRefundStatusLookup,
): Promise<PaytmRefundStatusResult> {
  assertSecureEndpoint(options.baseUrl);
  if (!nonEmptyString(lookup.orderId) || !nonEmptyString(lookup.refId)) {
    throw new Error(
      "orderId and refId are required for a Paytm refund status lookup.",
    );
  }

  const doFetch = options.fetch ?? fetch;
  const response = await doFetch(
    `${options.baseUrl}${PAYTM_REFUND_STATUS_PATH}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.sharedSecret}`,
      },
      body: JSON.stringify({ orderId: lookup.orderId, refId: lookup.refId }),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Paytm refund status lookup failed: HTTP ${response.status}`,
    );
  }

  const body = (await response.json()) as Record<string, unknown>;
  const resultStatus = nonEmptyString(body.resultStatus);
  if (body.provider !== "paytm" || resultStatus === null) {
    throw new Error(
      "Paytm refund status lookup returned an unexpected response.",
    );
  }

  return {
    provider: "paytm",
    resultStatus,
    resultCode: nonEmptyString(body.resultCode),
    resultMessage: nonEmptyString(body.resultMessage),
  };
}
