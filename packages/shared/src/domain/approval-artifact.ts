import type { JsonValue } from "../types/Json.js";
import type { Signature } from "./signature.js";

/**
 * Parmana Trust Core
 *
 * Approval Artifact (TD-23 closure, Phase 3C)
 *
 * A cryptographically verifiable, independently-issued attestation
 * that a specific external business authority approved a specific,
 * bounded fact about a specific capability and business object --
 * replacing a caller-declared authorization assertion (e.g.
 * `preAuthorizedForAmountChange: true`) that Parmana's own
 * Execution Authorization cannot truthfully represent, because the
 * Execution Authorization proves Parmana's own runtime approved a
 * Decision, not that an independent business authority approved an
 * exception to it.
 *
 * Design frozen in §7 of the Phase 3A approval artifact design (in git
 * history). This file implements that specification's schema exactly --
 * field names, types, and mandatory/optional status are not
 * reinterpreted here.
 *
 * Trust Chain (mirrors ExecutionAuthorizationPayload's own doc
 * comment style):
 *
 * Business Approval (an authority independent of the AI caller and
 *   of Parmana's own runtime)
 *      ↓
 * Approval Artifact (this type)
 *      ↓
 * Canonical Serialization (CanonicalSerializer, reused verbatim)
 *      ↓
 * Signature (the issuer's own key -- never Parmana's runtime key)
 *      ↓
 * Verification (@parmana/approval's ApprovalVerifier)
 *      ↓
 * Policy (the verified fact populates a policy signal, replacing the
 *   caller's own declared value)
 */

/**
 * Restricted comparator vocabulary for Approval scope checks.
 * Deliberately narrower than PolicyEngine's own operator set (see
 * packages/policy/src/types/Policy.ts's PolicyOperator) -- an
 * approval bounds one numeric or exact-match fact, not an arbitrary
 * policy condition tree.
 */
export type ApprovalScopeComparator =
  "eq" | "lte" | "gte" | "lt" | "gt" | "between";

/**
 * The bound being approved. `value`'s shape depends on `comparator`:
 * a plain number/string for eq/lte/gte/lt/gt, or a {min, max} range
 * for `between`.
 */
export interface ApprovalScope {
  /**
   * The name of the specific policy-evaluated fact this artifact
   * attests to -- e.g. "amountDeltaAbs". Exactly one fact per
   * artifact; an approval is never a blanket "everything about this
   * request is fine."
   */
  readonly field: string;

  readonly comparator: ApprovalScopeComparator;

  readonly value:
    number | string | { readonly min: number; readonly max: number };
}

/**
 * Identifies the approving party and which of their registered keys
 * signed this artifact. Never the AI caller's own callerId, and
 * never Parmana's own runtime identity (DEFAULT_KEY_ID) -- see
 * ApprovalIssuerRegistry (@parmana/approval) for how this is
 * resolved to a trusted public key.
 */
export interface ApprovalIssuer {
  readonly approverId: string;

  readonly keyId: string;
}

export interface ApprovalPayload {
  /**
   * Payload format version. Verifiers MUST reject any other value
   * (including missing) before attempting signature verification --
   * identical discipline to ExecutionAuthorizationPayload.version.
   */
  readonly version: 1;

  /**
   * Unique identifier for this artifact.
   */
  readonly approvalId: string;

  readonly issuer: ApprovalIssuer;

  /**
   * ISO-8601 UTC timestamp when the approval was granted.
   */
  readonly issuedAt: string;

  /**
   * ISO-8601 UTC expiry. REQUIRED. Verifiers MUST reject an artifact
   * past this time -- identical discipline to
   * ExecutionAuthorizationPayload.expiresAt.
   */
  readonly expiresAt: string;

  /**
   * The exact capability (Intent.action) this approval is scoped to
   * -- e.g. "hubspot:deal-update". Prevents capability substitution.
   */
  readonly capability: string;

  /**
   * The exact business object this approval covers, in the same
   * identifier shape the capability's own Intent.parameters carries
   * (e.g. a HubSpot dealId) -- not a wildcard, not a pattern.
   * Prevents authorization transfer to another business object.
   */
  readonly resourceId: string;

  readonly scope: ApprovalScope;

  /**
   * Reserved, additive extension point for future scope dimensions.
   * Absent by default -- no concrete field needed yet (Phase 3A §17,
   * Open Question #3).
   */
  readonly constraints?: Readonly<Record<string, JsonValue>>;

  /**
   * Single-use. Burned on first successful verification via the
   * existing NonceStore interface, reused verbatim.
   */
  readonly nonce: string;
}

/**
 * The complete envelope an Approval Artifact travels as.
 */
export interface SignedApproval {
  readonly payload: ApprovalPayload;

  /**
   * Signature over the canonical serialization of payload, produced
   * by the issuer's own private key -- never Parmana's runtime key.
   */
  readonly signature: Signature;
}
