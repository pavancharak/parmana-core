-- =============================================================================
-- Caller-capability-scoping audit trail (caller-to-capability scoping)
-- =============================================================================
--
-- Backs CallerAuditEvent's new "caller.capability_denied" type and
-- `capability` field (packages/api/src/auth/CallerAuditSink.ts,
-- packages/api/src/routes/execute.ts / transactions.ts): an
-- authenticated caller attempting a capability outside its
-- ApiKeyEntry.allowedCapabilities is denied, and that denial is
-- audited the same way a missing/invalid credential already is.
--
-- Widens the type CHECK constraint from 20260718090000 to add the
-- new event type, mirroring 20260718190412's DROP/ADD CONSTRAINT
-- pattern for razorpay_webhook_audit_events. Adds `capability`,
-- nullable and additive like every prior column addition to this
-- table (signature_json, 20260802130000) -- existing rows are
-- unaffected, every row written from here forward that concerns a
-- specific capability carries it.

ALTER TABLE caller_audit_events
DROP CONSTRAINT IF EXISTS caller_audit_events_type_check;

ALTER TABLE caller_audit_events
ADD CONSTRAINT caller_audit_events_type_check
CHECK (type IN (
    'caller.authenticated',
    'caller.rejected',
    'caller.capability_denied'
));

ALTER TABLE caller_audit_events
ADD COLUMN IF NOT EXISTS capability TEXT;

CREATE INDEX IF NOT EXISTS idx_caller_audit_events_capability
ON caller_audit_events (
    capability
)
WHERE capability IS NOT NULL;
