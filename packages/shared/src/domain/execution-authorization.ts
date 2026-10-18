import type { JsonValue } from "../types/Json.js";

/**
 * Execution Authorization
 *
 * Proof that Parmana authorized a specific
 * execution request.
 *
 * Enterprise systems should execute only
 * requests carrying a valid, verified
 * SignedExecutionAuthorization.
 *
 * All timestamps are ISO-8601 UTC strings so the
 * artifact serializes identically before signing
 * (Parmana side) and after JSON transport
 * (receiving side). Never use Date objects here.
 */

/**
 * The signed payload.
 *
 * Every field participates in the signature.
 */
export interface ExecutionAuthorizationPayload {
  /**
   * Payload format version.
   *
   * Verifiers MUST reject any value other than 1
   * (including a missing field) before attempting
   * signature verification. There are no external
   * consumers of the prior unversioned format, so
   * this is a breaking change made once, not a
   * migrated one — see docs/CLAIMS.md.
   */
  readonly version: 1;

  /**
   * Unique authorization identifier.
   */
  readonly authorizationId: string;

  /**
   * Single-use nonce.
   *
   * Receiving systems MUST reject an
   * authorization whose nonce has been
   * seen before.
   */
  readonly nonce: string;

  /**
   * Approved Decision.
   */
  readonly decisionId: string;

  /**
   * Outcome of the decision this authorization was issued for. Signed
   * with the rest of the payload. ExecutionGateway releases only
   * "APPROVED"; it refuses an authorization with any other value or
   * with none, so a signature alone never releases an action.
   */
  readonly decisionOutcome?: "APPROVED";

  /**
   * Business Transaction.
   */
  readonly businessTransactionId: string;

  /**
   * Policy that produced the decision.
   */
  readonly policyName: string;

  /**
   * Policy version that produced the decision.
   */
  readonly policyVersion: string;

  /**
   * ISO-8601 UTC time the authorization
   * was issued.
   */
  readonly authorizedAt: string;

  /**
   * ISO-8601 UTC expiry. REQUIRED.
   *
   * Receiving systems MUST reject an
   * authorization past this time.
   */
  readonly expiresAt: string;

  /**
   * Canonical content hash of the ExecutableContent
   * (businessTransactionId, action, target,
   * parameters) approved for execution.
   *
   * Computed identically by the signing side (from
   * the runtime's in-memory transaction) and the
   * verifying side (from the JSON-parsed request) via
   * the same ExecutableContentHasher, so a receiving
   * gateway can recompute this hash from the exact
   * content it is about to forward and reject any
   * mismatch — closing the gap where a valid envelope
   * could accompany a modified payload carrying the
   * same businessTransactionId.
   */
  readonly businessTransactionHash: string;

  /**
   * Canonical content hash (G-24) of the exact Policy document that
   * produced this authorization's Decision -- proves which policy
   * *content*, not merely which version string, was in force. Policy
   * governance (see PendingPolicyChange) permits in-place content
   * edits to an existing version string, so a version-string
   * comparison alone cannot detect every real policy change; a
   * receiving gateway with access to the current policy content can
   * recompute this hash and reject execution if the policy has
   * changed since authorization.
   *
   * Optional so every pre-existing construction site and already-
   * issued authorization (signed before this field existed) keeps
   * compiling and verifying unchanged -- an absent value means "not
   * covered by the policy-freshness check," not "policy is stale."
   */
  readonly policyContentHash?: string;

  /**
   * Canonical content hash of the runtime PolicySignals evaluated to
   * produce this authorization's Decision -- proves what real-world
   * conditions (vendor status, risk exposure, market state, etc.)
   * justified the decision, distinct from businessTransactionHash
   * (which covers only action/target/parameters) and policyContentHash
   * (which covers only the policy rules). A receiving gateway with
   * access to the exact signals this authorization was signed under,
   * and a capability-scoped SignalStateVerifier, can recompute this
   * hash and independently re-derive current signal state, rejecting
   * execution if either has drifted since authorization.
   *
   * Optional so every pre-existing construction site and already-
   * issued authorization (signed before this field existed) keeps
   * compiling and verifying unchanged -- an absent value means "not
   * covered by the signal-freshness check," not "signals are stale."
   */
  readonly signalsHash?: string;

  /**
   * The authenticated caller (the same identity already threaded into
   * BusinessTransaction.metadata.submittedBy) that this authorization
   * was issued for, when caller-auth was enabled for the request.
   *
   * Optional for the same reason policyContentHash/signalsHash are:
   * every pre-existing construction site and already-issued
   * authorization keeps compiling and verifying unchanged. Absent
   * means "issued with caller-auth disabled or no caller identified,"
   * not "no caller exists."
   */
  readonly submittedBy?: string;

  /**
   * The capability (Business Transaction intent.action) that
   * isCapabilityAllowed() confirmed this caller was permitted to
   * invoke, at the moment it confirmed it -- i.e. what the API-edge
   * caller-to-capability check actually cleared, carried forward as a
   * signed fact rather than discarded once the request passes.
   *
   * A receiving system with access to this authorization can confirm
   * this equals the executed content's own action, catching any
   * divergence between what a caller was cleared to invoke and what
   * is actually presented for execution, without needing its own
   * access to the live caller/capability configuration.
   *
   * Optional for the same reason submittedBy is: absent means "no
   * caller-capability check ran for this authorization" (caller-auth
   * disabled), not "any capability is granted."
   */
  readonly grantedCapability?: string;

  /**
   * The business facts this authorization rests on (RFC-0023 phase 4):
   * each Trusted Signal the decision established, with the value its
   * source gave and until when it holds. Present only when the policy
   * sourced facts. Signed, so a gateway can refuse to release once any
   * is past its validUntil, and an endpoint can execute only if each
   * still holds in its own records.
   */
  readonly businessConditions?: readonly AuthorizationBusinessCondition[];

  /**
   * The authority grant this authorization rests on (RFC-0023 phase 3),
   * when the policy required one. Signed, so a gateway can refuse to
   * release once the grant has expired or been revoked.
   */
  readonly authorityGrant?: AuthorizationGrantBound;
}

/**
 * One Trusted Signal, as the authorization carries it.
 */
export interface AuthorizationBusinessCondition {
  readonly signalId: string;
  readonly signalKey: string;
  readonly source: string;
  readonly claim: string;
  readonly subject: string;
  readonly value: JsonValue;
  /** ISO-8601 UTC. After this, the fact may no longer hold. */
  readonly validUntil: string;
}

/**
 * The grant an authorization rests on, as the authorization carries it.
 */
export interface AuthorizationGrantBound {
  readonly grantId: string;
  /** ISO-8601 UTC. After this, the grant no longer holds. */
  readonly validUntil: string;
}

/**
 * The complete envelope crossing the
 * execution boundary.
 */
export interface SignedExecutionAuthorization {
  /**
   * The signed payload.
   */
  readonly payload: ExecutionAuthorizationPayload;

  /**
   * Signature over the canonical
   * serialization of the payload.
   */
  readonly signature: string;

  /**
   * Identifier of the signing key, so the
   * verifier can select the correct
   * public key.
   */
  readonly keyId: string;

  /**
   * Signature algorithm identifier.
   */
  readonly algorithm: string;
}
