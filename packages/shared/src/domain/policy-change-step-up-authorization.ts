/**
 * Policy Change Step-Up Authorization (Policy Governance, maker-checker).
 *
 * A second, independent proof of intent a human checker presents on
 * POST /policies/pending-changes/:id/approve and .../reject, on top of
 * (never instead of) their bearer-token identity and isHumanCaller.ts.
 * Signed by the checker's own Ed25519 keypair -- provisioned once by
 * generate-api-key.ts, held only by the checker, never derived from or
 * stored alongside their bearer token -- so a leaked bearer token alone
 * is not sufficient to approve or reject a policy change.
 *
 * Deliberately shaped like SignedExecutionAuthorization (payload +
 * flat base64 signature + keyId + algorithm), not like the Signature
 * object type PolicyChangeApprovalRecord.signature uses: this is a
 * caller-issued envelope crossing the wire, the same category of
 * artifact SignedExecutionAuthorization is, not a self-issued Parmana
 * signature over a durable record.
 *
 * Deliberately its own type, not a reuse of SignedApproval
 * (@parmana/approval): SignedApproval's capability/resourceId/scope
 * fields model a bounded business-transaction value approval (e.g. "an
 * amount <= 5000"), evaluated as PolicySignals evidence. A policy
 * governance approve/reject is a plain yes/no action with no bounded
 * value to check -- forcing it through SignedApproval's scope shape
 * would mean inventing a meaningless always-true scope just to satisfy
 * the type. The verification *pattern* (signed payload, replay-checked
 * nonce, checks-then-nonce-last ordering) is reused; the artifact type
 * is not.
 */
export interface PolicyChangeStepUpAuthorizationPayload {
  /**
   * Payload format version. Verifiers MUST reject any other value
   * (including a missing field) before attempting signature
   * verification -- mirrors ExecutionAuthorizationPayload.version.
   */
  readonly version: 1;

  /**
   * Single-use nonce. Verifiers MUST reject a payload whose nonce has
   * been seen before (see PolicyChangeStepUpVerifier, backed by its
   * own dedicated NonceStore/table, a distinct trust domain from both
   * ExecutionGateway's consumed_nonces and Approval Artifact's
   * consumed_approval_nonces).
   */
  readonly nonce: string;

  /**
   * The specific PendingPolicyChange this envelope authorizes. A
   * signed envelope for one pending change must never be accepted for
   * a different one, even if otherwise valid.
   */
  readonly pendingPolicyChangeId: string;

  /**
   * The specific action this envelope authorizes. A signed "approve"
   * envelope must never be accepted for a reject request, or vice
   * versa, even if otherwise valid.
   */
  readonly action: "approve" | "reject";

  /**
   * ISO-8601 UTC time the envelope was signed.
   */
  readonly authorizedAt: string;

  /**
   * ISO-8601 UTC expiry. REQUIRED. Verifiers MUST reject an envelope
   * past this time, and MUST reject a TTL (expiresAt - authorizedAt)
   * exceeding server policy, so a compromised signer cannot mint
   * long-lived envelopes.
   */
  readonly expiresAt: string;
}

/**
 * The complete envelope crossing the wire in an approve/reject request
 * body.
 */
export interface PolicyChangeStepUpAuthorization {
  readonly payload: PolicyChangeStepUpAuthorizationPayload;

  /**
   * Base64-encoded signature over the canonical serialization of
   * payload.
   */
  readonly signature: string;

  /**
   * Identifier of the signing key, for operator-facing diagnostics
   * (key rotation, audit) -- not used to select a verification key:
   * the checker's public key is resolved from their own ApiKeyEntry
   * (req.callerStepUpPublicKey), never from a caller-supplied field.
   */
  readonly keyId: string;

  /**
   * Signature algorithm identifier. Always "ed25519" today -- step-up
   * keys are generated exclusively as Ed25519 by generate-api-key.ts,
   * independent of the server's own configured SIGNATURE_PROVIDER
   * (that setting governs Parmana's own runtime signing key, never an
   * operator-held step-up key). Carried on the envelope for forward
   * compatibility and diagnostics, not read to select the verifier.
   */
  readonly algorithm: string;
}
