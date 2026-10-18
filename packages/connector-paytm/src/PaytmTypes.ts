/**
 * Paytm domain types.
 *
 * Scoped narrowly to this milestone: forwarding a governed refund
 * request to the trusted, out-of-process Paytm connector service
 * (parmana-paytm-agent) and validating what it returns. This package
 * never models Paytm's own /refund/apply wire shape -- that shape,
 * Paytm's merchant key, and Paytm's own checksum verification live
 * exclusively inside the connector service, never inside Parmana.
 */

import { createHash } from "node:crypto";

/**
 * Deny-by-default: the only paytm:refund parameter names this
 * connector will ever forward in a request body. Any other parameter
 * name present in a request's parameters is refused before any network
 * call -- see GatewayPaytmAdapter.execute.
 */
export const PAYTM_ALLOWED_REFUND_PARAMETERS = Object.freeze([
  "orderId",
  "transactionId",
  "amount",
  "refundReason",
  "refundReference",
] as const);

/**
 * Upper bounds this connector enforces on the two optional free text
 * parameters before forwarding them (G-71). They are this connector's
 * own limits; Paytm's own limit on a refund comment was not checked.
 */
export const PAYTM_REFUND_REFERENCE_MAX_LENGTH = 128;
export const PAYTM_REFUND_REASON_MAX_LENGTH = 256;

export type PaytmAllowedRefundParameter =
  (typeof PAYTM_ALLOWED_REFUND_PARAMETERS)[number];

/**
 * The built-in test-mode placeholder shared secret
 * (createPaytmCredentialProvider.ts's fallback when no real test-mode
 * secret is configured). Exported here, shared by both that fallback
 * and GatewayPaytmAdapter's own fail-closed guard against sending it to
 * a non-local endpoint, so the two sides can never drift apart into
 * comparing different literals.
 *
 * This guard exists for the same reason HubSpotTypes.ts's
 * HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN does (see that file's comment,
 * and docs/CLAIMS.md 3.4 on the Razorpay incident this pattern closes):
 * never rely on the far side happening to reject a test-mode
 * placeholder -- refuse to send it outright to anything that isn't
 * plainly a local/mock endpoint.
 */
export const PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET =
  "paytm-connector-test-mode-placeholder";

export interface PaytmConnectorCredentialValue {
  /**
   * The shared secret Parmana's gateway authenticates itself to the
   * remote Paytm connector service with (PAYTM_CONNECTOR_SHARED_SECRET).
   * This is transport authentication between Parmana and its own
   * connector service -- it is never Paytm's merchant key, and it never
   * substitutes for Parmana's own policy authorization.
   */
  readonly sharedSecret: string;
}

export function isPaytmConnectorCredentialValue(
  value: unknown,
): value is PaytmConnectorCredentialValue {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sharedSecret === "string" &&
    candidate.sharedSecret.length > 0
  );
}

/**
 * One-way fingerprint of the connector shared secret, safe to place in
 * receipts and caller-visible execution evidence: a truncated SHA-256
 * digest, never a literal substring of the secret. Mirrors
 * redactHubSpotToken's fix (Phase 3D certification) from this
 * connector's first version -- never a truncated-but-literal prefix.
 */
export function redactPaytmConnectorSecret(secret: string): string {
  return `fp_${createHash("sha256").update(secret).digest("hex").slice(0, 12)}`;
}

/**
 * TTL, in milliseconds, applied to the authorization signature
 * GatewayPaytmAdapter attaches to each outbound request (ADR-0009
 * Phase 2B / "Paytm wire-protocol signature verification"). Short
 * deliberately: this bounds how long a captured, replayed request
 * would remain acceptable to parmana-paytm-agent if the shared secret
 * were ever also compromised alongside a captured signed request.
 */
export const PAYTM_AUTHORIZATION_SIGNATURE_TTL_MS = 60_000;

/**
 * Builds the exact byte sequence GatewayPaytmAdapter signs and
 * parmana-paytm-agent independently rebuilds and verifies (ADR-0009
 * Phase 2B). Pipe-delimited, not JSON: this string crosses a repo
 * boundary maintained by two independently-evolving codebases, and a
 * JSON object's key ordering is not a contract either side can rely on
 * staying identical -- a fixed-order, fixed-field delimited string
 * has no such ambiguity.
 *
 * Every field here is one already present, verbatim, in the outbound
 * request body's own `transaction`/`intent`/`parameters` -- this
 * function does not introduce any value the receiving side can't
 * independently recompute from the rest of the request it already
 * parsed. `expiresAt` (epoch milliseconds, not an ISO string, for the
 * same cross-repo-ambiguity reason) is the one value that exists only
 * inside `authorization.payload`, carried there for exactly this
 * purpose.
 *
 * If you change this function, parmana-paytm-agent's own copy
 * (referenced there as canonicalPaytmAuthorizationString) must change
 * identically, or every request this codebase signs will fail
 * verification on the receiving side.
 */
export function canonicalPaytmAuthorizationString(input: {
  readonly businessTransactionId: string;
  readonly action: string;
  readonly orderId: string;
  readonly txnId: string;
  readonly amount: string;
  readonly expiresAt: number;
}): string {
  return [
    input.businessTransactionId,
    input.action,
    input.orderId,
    input.txnId,
    input.amount,
    String(input.expiresAt),
  ].join("|");
}

/**
 * Deterministic refId derivation, keyed on the logical refund --
 * (orderId, transactionId), the Paytm order/transaction actually being
 * refunded -- never on Parmana's own businessTransactionId, which
 * differs across distinct authorization attempts for the same logical
 * refund (e.g. a legitimate retry after an earlier attempt's outcome
 * was unclear).
 *
 * The real parmana-paytm-agent connector service requires the CALLER
 * to supply refId; it has no server-side idempotency derivation of its
 * own (its RefundIdempotencyStore exists but is not wired into
 * POST /connector/paytm-refund). GatewayPaytmAdapter is therefore the
 * only thing standing between "a retry" and "a second, differently-
 * refId'd refund" -- this function is a pure, deterministic hash with
 * no Date.now()/Math.random(), so calling it twice for the same
 * (orderId, transactionId) always produces the same refId, and Paytm's
 * own refId-based idempotency on /refund/apply is what ultimately
 * prevents a duplicate refund even if the connector service's own call
 * to Paytm is retried independently.
 *
 * G-71: keyed on (orderId, transactionId) alone, every refund of one
 * Paytm transaction gets the same refId, so a second, partial refund of
 * it looks to Paytm like the first one again. A caller that sends
 * `refundReference` (its own stable id for ONE refund) gets a refId keyed
 * on (orderId, transactionId, refundReference): retries of that refund
 * keep one refId, and a different refund of the same transaction gets
 * another. Without a reference the derivation is unchanged, so a refund
 * retried across this change keeps its refId.
 */
export function deriveDeterministicPaytmRefId(
  orderId: string,
  transactionId: string,
  refundReference?: string,
): string {
  const seed =
    refundReference === undefined
      ? `${orderId}:${transactionId}`
      : // JSON, not ":" joining: a ":" inside an id cannot make two
        // different triples collide.
        JSON.stringify([
          "paytm-refund-ref:v2",
          orderId,
          transactionId,
          refundReference,
        ]);
  const digest = createHash("sha256").update(seed).digest("hex");
  return `refid_${digest.slice(0, 24)}`;
}

/**
 * The exact response body shape the real parmana-paytm-agent connector
 * service returns from POST /connector/paytm-refund (see that
 * repository's src/server/index.ts, executeAuthorizedConnectorRequest).
 * There is no separate "status" enum -- only a boolean `success`, plus
 * whatever raw Paytm result code/status the connector service chooses
 * to surface in `metadata`. Every identifying field here is expected
 * to echo the exact request this connector sent -- see
 * GatewayPaytmAdapter's response validation, which fails closed on any
 * mismatch instead of trusting the response as proof it corresponds to
 * this request.
 */
export interface PaytmAgentRefundExecutionResult {
  readonly businessTransactionId: string;
  readonly action: string;
  readonly target: string;
  readonly parameters: {
    readonly orderId: string;
    readonly txnId: string;
    readonly refId: string;
    readonly amount: string;
  };
  readonly success: boolean;
  readonly executedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

function isPaytmAgentRefundParameters(
  value: unknown,
): value is PaytmAgentRefundExecutionResult["parameters"] {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.orderId === "string" &&
    typeof candidate.txnId === "string" &&
    typeof candidate.refId === "string" &&
    candidate.refId.length > 0 &&
    typeof candidate.amount === "string"
  );
}

export function isPaytmAgentRefundExecutionResult(
  value: unknown,
): value is PaytmAgentRefundExecutionResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.businessTransactionId === "string" &&
    typeof candidate.action === "string" &&
    typeof candidate.target === "string" &&
    isPaytmAgentRefundParameters(candidate.parameters) &&
    typeof candidate.success === "boolean" &&
    typeof candidate.executedAt === "string"
  );
}
