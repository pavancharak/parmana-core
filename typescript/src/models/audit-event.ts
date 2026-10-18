/**
 * A signed caller-authentication audit event, as recorded by
 * CallerAuditSink (packages/api/src/auth/CallerAuditSink.ts) and
 * verified by POST /audit/verify. Deliberately a loose bag beyond the
 * three required fields -- event shapes can diverge on every field past
 * these, and verification operates on canonical bytes over whatever
 * object was actually signed, not a specific parsed shape.
 */
export interface AuditEvent {
  readonly type: string;
  readonly occurredAt: string;
  readonly route: string;
  readonly [key: string]: unknown;
}
