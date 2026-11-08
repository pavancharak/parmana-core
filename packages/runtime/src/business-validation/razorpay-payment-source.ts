import type {
  BusinessSignalQuery,
  BusinessSignalSource,
  BusinessSignalSourceAnswer,
} from "./BusinessSignalSource.js";

/**
 * Establishes "payment.refundable" from Razorpay's own record of the payment, for a refund.
 *
 * It reads GET /v1/payments/{id} and reports whether the payment is captured, not fully refunded, and
 * has at least the requested amount left. The answer is observed, so it becomes a trusted signal only
 * while `validUntil` holds: 60 seconds, the release lifetime, so a stale answer cannot be used.
 *
 * A payment that does not exist is "not_found". A failure to read, or a bad request, throws, and the
 * runtime records the source as unavailable. The credential is never included in an error.
 */

export const RAZORPAY_PAYMENT_CLAIM = "payment.refundable";
export const RAZORPAY_PAYMENT_SOURCE_NAME = "razorpay";

const API = "https://api.razorpay.com/v1";
const PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/;
const VALID_FOR_MS = 60_000;
const READ_TIMEOUT_MS = 10_000;

export interface RazorpayPaymentSourceOptions {
  /** The read-only credential, "<key id>:<key secret>". */
  readonly credential: string;
  /** Injectable for tests. Defaults to the global fetch. */
  readonly fetch?: typeof fetch;
  /** Injectable for tests. */
  readonly now?: () => Date;
}

export function createRazorpayPaymentSource(
  options: RazorpayPaymentSourceOptions,
): BusinessSignalSource {
  if (options.credential.length === 0 || !options.credential.includes(":")) {
    throw new Error(
      "the Razorpay payment source needs a key id and key secret",
    );
  }
  const authorization = `Basic ${Buffer.from(options.credential).toString("base64")}`;
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());

  return {
    name: RAZORPAY_PAYMENT_SOURCE_NAME,
    async resolve(
      query: BusinessSignalQuery,
    ): Promise<BusinessSignalSourceAnswer> {
      if (query.claim !== RAZORPAY_PAYMENT_CLAIM) {
        // A policy asked this source for a fact it does not establish. That is a configuration error.
        throw new Error(
          `the Razorpay payment source does not establish the claim "${query.claim}"`,
        );
      }
      if (!PAYMENT_ID.test(query.subject)) {
        return {
          kind: "not_found",
          reason: "the subject is not a Razorpay payment id",
        };
      }
      const requested = query.parameters?.amount;
      if (
        typeof requested !== "number" ||
        !Number.isInteger(requested) ||
        requested <= 0
      ) {
        throw new Error(
          "the refund amount must be a positive whole number of paise",
        );
      }

      const response = await doFetch(`${API}/payments/${query.subject}`, {
        method: "GET",
        headers: { Authorization: authorization },
        redirect: "error",
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      });
      if (response.status === 404) {
        return {
          kind: "not_found",
          reason: "Razorpay has no payment with this id",
        };
      }
      if (response.status !== 200) {
        throw new Error(
          `Razorpay answered HTTP ${response.status} for the payment read`,
        );
      }

      let json: Record<string, unknown>;
      try {
        json = (await response.json()) as Record<string, unknown>;
      } catch {
        throw new Error("Razorpay's payment read was not JSON");
      }
      if (
        typeof json.status !== "string" ||
        typeof json.amount !== "number" ||
        typeof json.amount_refunded !== "number"
      ) {
        throw new Error(
          "Razorpay's payment read is missing status, amount or amount_refunded",
        );
      }

      const remaining = json.amount - json.amount_refunded;
      const refundStatus =
        typeof json.refund_status === "string" ? json.refund_status : null;
      const holds =
        json.status === "captured" &&
        refundStatus !== "full" &&
        remaining >= requested;

      const observedAt = now();
      return {
        kind: "observed",
        value: holds,
        sourceIdentity: "razorpay:payments",
        observedAt,
        validUntil: new Date(observedAt.getTime() + VALID_FOR_MS),
      };
    },
  };
}
