import type { NextFunction, Request } from "express";

import type { CallerAuditEvent, CallerAuditSink } from "./CallerAuditSink.js";
import { AuditUnavailableError } from "./AuditUnavailableError.js";

/**
 * Records a caller-audit event, failing closed on a write error: logs
 * a structured entry naming the failure, passes AuditUnavailableError
 * to next() so the centralized error handler returns a 503, and
 * returns false so the caller can stop before res.status()/next()
 * (whichever the success path would have done). An action that
 * executes without an audit record contradicts the product's core
 * claim — see AuditUnavailableError's own comment and
 * docs/VERIFICATION-GAPS.md.
 *
 * Shared between middleware/caller-auth.ts (missing/invalid
 * credential) and any route that authorizes a caller against
 * declared scope after authentication (e.g. isCapabilityAllowed.ts's
 * call sites in execute.ts/transactions.ts) — the single fail-closed
 * audit-write discipline every caller-layer denial goes through, not
 * a separate path per denial reason.
 *
 * Deliberately no retry, buffering, or queueing: that would convert
 * fail-closed into eventually-audited, a different design.
 */
export async function recordCallerAuditEvent(
  auditSink: CallerAuditSink,
  event: CallerAuditEvent,
  req: Request,
  next: NextFunction,
): Promise<boolean> {
  try {
    await auditSink.record(event);
    return true;
  } catch (error) {
    console.error({
      event: "caller_audit_write_failed",
      route: req.originalUrl,
      error: error instanceof Error ? error.message : String(error),
    });

    next(new AuditUnavailableError());
    return false;
  }
}
