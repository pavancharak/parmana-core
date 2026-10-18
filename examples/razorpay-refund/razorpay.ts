/**
 * The Razorpay side of the demo endpoint: refund one payment, once.
 *
 * It refunds only with Razorpay test-mode keys (key id `rzp_test_...`):
 * this is a demo, and a live key is refused before any call is made.
 *
 * Acting once does not rely on this function's memory. Each refund is
 * created with `receipt` set to Parmana's businessTransactionId, and
 * before creating one the endpoint asks Razorpay for the payment's
 * refunds: if one already carries that receipt, it answers with it
 * instead of refunding again. So a release sent twice, to two serverless
 * instances, refunds once.
 *
 * Razorpay API used: GET /v1/payments/{id}/refunds and
 * POST /v1/payments/{id}/refund, with HTTP basic auth (key id, key secret).
 * Amounts are in paise.
 */

export interface RazorpayCredentials {
  readonly keyId: string;
  readonly keySecret: string;
}

export interface RefundRequest {
  readonly paymentId: string;
  /** Paise, a positive whole number. */
  readonly amount: number;
  /** Parmana's businessTransactionId, kept as the refund's receipt. */
  readonly receipt: string;
}

export interface RefundOutcome {
  readonly success: boolean;
  readonly result: Record<string, unknown>;
}

type Fetch = typeof fetch;

const API = "https://api.razorpay.com/v1";
const PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/;

interface RazorpayRefund {
  readonly id: string;
  readonly amount: number;
  readonly receipt?: string | null;
  readonly status: string;
  readonly payment_id: string;
}

function summary(refund: RazorpayRefund, alreadyRefunded: boolean) {
  return {
    refundId: refund.id,
    paymentId: refund.payment_id,
    amount: refund.amount,
    status: refund.status,
    receipt: refund.receipt ?? null,
    alreadyRefunded,
    mode: "test",
  };
}

export function assertTestMode(credentials: RazorpayCredentials): void {
  if (!credentials.keyId.startsWith("rzp_test_")) {
    throw new Error(
      "This demo refunds only in Razorpay test mode: RAZORPAY_KEY_ID must start with rzp_test_.",
    );
  }

  if (credentials.keySecret.trim() === "") {
    throw new Error("RAZORPAY_KEY_SECRET is not set.");
  }
}

export function createRefunder(
  credentials: RazorpayCredentials,
  fetchImpl: Fetch = fetch,
) {
  assertTestMode(credentials);

  const authorization = `Basic ${Buffer.from(
    `${credentials.keyId}:${credentials.keySecret}`,
  ).toString("base64")}`;

  async function call(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const response = await fetchImpl(`${API}${path}`, {
      method,
      headers: {
        Authorization: authorization,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      // Two calls must fit in the connector timeout Parmana registers (10 s).
      signal: AbortSignal.timeout(4_000),
    });
    const text = await response.text();
    let json: Record<string, unknown>;

    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = { raw: text.slice(0, 500) };
    }

    return { status: response.status, json };
  }

  function failure(
    stage: string,
    status: number,
    json: Record<string, unknown>,
  ) {
    const error = (json.error ?? {}) as Record<string, unknown>;

    return {
      success: false,
      result: {
        stage,
        httpStatus: status,
        code: error.code ?? null,
        description: error.description ?? null,
        mode: "test",
      },
    };
  }

  return async function refund(request: RefundRequest): Promise<RefundOutcome> {
    if (!PAYMENT_ID.test(request.paymentId)) {
      return {
        success: false,
        result: {
          stage: "validate",
          description: "The target is not a Razorpay payment id (pay_...).",
        },
      };
    }

    if (!Number.isInteger(request.amount) || request.amount <= 0) {
      return {
        success: false,
        result: {
          stage: "validate",
          description:
            "parameters.amount must be a positive whole number of paise.",
        },
      };
    }

    const existing = await call(
      "GET",
      `/payments/${request.paymentId}/refunds?count=100`,
    );

    if (existing.status !== 200) {
      return failure("list-refunds", existing.status, existing.json);
    }

    const items = (existing.json.items ?? []) as RazorpayRefund[];
    const earlier = items.find((item) => item.receipt === request.receipt);

    if (earlier !== undefined) {
      return { success: true, result: summary(earlier, true) };
    }

    const created = await call(
      "POST",
      `/payments/${request.paymentId}/refund`,
      {
        amount: request.amount,
        speed: "normal",
        receipt: request.receipt,
        notes: { parmanaBusinessTransactionId: request.receipt },
      },
    );

    if (created.status !== 200) {
      return failure("create-refund", created.status, created.json);
    }

    return {
      success: true,
      result: summary(created.json as unknown as RazorpayRefund, false),
    };
  };
}
