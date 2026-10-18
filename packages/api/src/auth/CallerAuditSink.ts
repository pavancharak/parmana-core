/**
 * Caller-authentication audit trail.
 *
 * Deliberately a separate sink from execution-control's
 * ExecutionAuditSink, not an extension of it: a rejected
 * caller never produces a connectorId, authorizationId, or
 * sessionId (no transaction has been constructed yet), and
 * folding this into that shape would blur the same caller
 * auth / execution authorization boundary this layering is
 * meant to keep sharp. See docs/site/concepts pages on
 * execution authorization and gateway attestation for the
 * two layers this one sits in front of.
 */
export interface CallerAuditEvent {
  readonly type:
    | "caller.authenticated"
    | "caller.rejected"
    | "caller.capability_granted"
    | "caller.capability_denied"
    | "caller.principal_denied"
    | "caller.non_human_denied"
    | "caller.structural_rejected";
  readonly occurredAt: string;
  readonly route: string;

  /**
   * Present on "caller.authenticated", "caller.capability_granted",
   * "caller.capability_denied", and "caller.principal_denied". Present
   * on "caller.structural_rejected"
   * only when caller-auth ran first and identified a caller before the
   * structural check failed (the UUID-format, field-validation, and
   * duplicate-id checks all run inside a route handler mounted after
   * caller-auth middleware) — absent for the malformed-JSON/oversized-
   * body case, which the body parser rejects before caller-auth
   * middleware, or any route handler, ever runs.
   */
  readonly callerId?: string;

  /**
   * Present on "caller.rejected", "caller.capability_denied",
   * "caller.principal_denied", and "caller.structural_rejected". Never
   * the credential itself.
   */
  readonly reason?: string;

  /**
   * The declared `businessTransactionId` a "caller.structural_rejected"
   * event concerns (G-29, docs/VERIFICATION-GAPS.md) — present whenever
   * the rejected request got far enough to have one (a malformed UUID
   * that still parsed as JSON, a structurally invalid transaction body,
   * or a duplicate id), absent only for the earliest possible failure
   * (malformed JSON / oversized body, rejected before any field of the
   * request body — valid or not — could be read at all). Present only
   * on "caller.structural_rejected".
   */
  readonly businessTransactionId?: string;

  /**
   * The capability (Business Transaction intent.action) this event
   * concerns. Present on "caller.capability_granted" and
   * "caller.capability_denied" — the generic "caller.authenticated"
   * event fires at the caller-auth middleware layer, before any
   * route-specific body is interpreted, so it deliberately stays
   * capability-agnostic; see isCapabilityAllowed.ts and its call
   * sites in execute.ts for where the capability is actually known,
   * checked, and (on success) recorded as granted.
   */
  readonly capability?: string;

  /**
   * The authority.principalId a caller attempted to assert but was
   * not permitted to. Present only on "caller.principal_denied" —
   * mirrors "capability" above exactly, same reasoning: the generic
   * "caller.authenticated" event fires before any route-specific body
   * is interpreted, so it stays principal-agnostic; see
   * isPrincipalAllowed.ts and its call sites for where the asserted
   * principalId is actually known and checked. Never the credential
   * itself — this is the caller-declared authority.principalId field,
   * a business identity, not an API key or its hash.
   */
  readonly principalId?: string;

  /**
   * Elevated-severity marker: a non-human credential attempting a
   * governance endpoint is exactly the kind of outcome that needs a
   * human to look, never silence. Always
   * "flagged" on "caller.non_human_denied" — absent (not merely
   * false) on every other event type, which are routine.
   */
  readonly severity?: "flagged";
}

export interface CallerAuditSink {
  record(event: CallerAuditEvent): Promise<void>;
}
