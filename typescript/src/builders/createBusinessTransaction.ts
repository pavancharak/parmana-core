import type { BusinessTransaction } from "../models/business-transaction.js";
import type { PolicyReference } from "../models/policy.js";

/**
 * Constructs a fully-formed, internally-consistent BusinessTransaction
 * from the fields a caller actually decides, deriving every field the
 * server's own BusinessTransactionValidator checks for cross-consistency
 * (packages/runtime/src/validators/BusinessTransactionValidator.ts) so a
 * caller can never build a request that fails one of those checks by
 * mistake:
 *
 *   - metadata.businessTransactionId always equals businessTransactionId
 *   - authorization.authorityId always equals authority.authorityId
 *   - intent.authorizationId always equals authorization.authorizationId
 *
 * Hand-building a BusinessTransaction by writing out all five nested
 * objects and keeping three id pairs in sync by hand is exactly the
 * class of mistake that produced every "X must match Y" 400 response
 * documented in docs/site/guides/end-to-end-paytm-flow.mdx. This function exists
 * so that mistake is structurally impossible when going through the
 * SDK, not merely documented as something to be careful about.
 *
 * businessTransactionId defaults to a fresh crypto.randomUUID() if
 * omitted. A caller providing one explicitly is responsible for it
 * being unique per attempt, since it doubles as the server's own
 * idempotency key (see docs/site/guides/end-to-end-paytm-flow.mdx,
 * "businessTransactionId is an idempotency key").
 */
export interface CreateBusinessTransactionOptions {
  /** Defaults to a fresh crypto.randomUUID() if omitted. */
  readonly businessTransactionId?: string;

  /** Defaults to "SERVICE", the correct value for an autonomous agent. Never "AGENT"; that value does not exist server-side. */
  readonly authorityType?: "USER" | "ROLE" | "SERVICE" | "ORGANIZATION";

  /**
   * The identity this transaction is submitted as. Must match one of
   * the caller API key's own allowedPrincipalIds server-side, or the
   * request is rejected before policy ever runs. See GET /callers/me.
   */
  readonly principalId: string;

  readonly displayName?: string;

  /** Human-readable reason for authorization.purpose. */
  readonly purpose: string;

  /** The capability being invoked, e.g. "paytm:refund". */
  readonly action: string;

  readonly target: string;

  readonly parameters: Record<string, unknown>;

  readonly policy: PolicyReference;

  /**
   * Facts the named policy evaluates. Every fact a policy rule
   * references must appear here, and every boundSignals entry the
   * policy declares is cross-checked against the matching intent
   * field (see the policy's own boundSignals) before evaluation runs
   * at all. A mismatch is rejected as a binding-tamper attempt, not
   * silently ignored.
   */
  readonly signals: Record<string, unknown>;

  readonly correlationId?: string;
  readonly tenantId?: string;
  readonly sourceSystem?: string;
  readonly submittedBy?: string;
}

export function createBusinessTransaction(
  options: CreateBusinessTransactionOptions,
): BusinessTransaction {
  const businessTransactionId =
    options.businessTransactionId ?? crypto.randomUUID();

  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();

  const now = new Date();

  return {
    businessTransactionId,

    metadata: {
      businessTransactionId,
      ...(options.correlationId !== undefined
        ? { correlationId: options.correlationId }
        : {}),
      ...(options.tenantId !== undefined ? { tenantId: options.tenantId } : {}),
      ...(options.sourceSystem !== undefined
        ? { sourceSystem: options.sourceSystem }
        : {}),
      ...(options.submittedBy !== undefined
        ? { submittedBy: options.submittedBy }
        : {}),
    },

    authority: {
      authorityId,
      authorityType: options.authorityType ?? "SERVICE",
      principalId: options.principalId,
      ...(options.displayName !== undefined
        ? { displayName: options.displayName }
        : {}),
      issuedAt: now,
    },

    authorization: {
      authorizationId,
      authorityId,
      purpose: options.purpose,
      issuedAt: now,
    },

    intent: {
      intentId,
      authorizationId,
      action: options.action,
      target: options.target,
      parameters: options.parameters,
      createdAt: now,
    },

    policy: options.policy,

    signals: options.signals,

    status: "RECEIVED",

    createdAt: now,
  };
}
