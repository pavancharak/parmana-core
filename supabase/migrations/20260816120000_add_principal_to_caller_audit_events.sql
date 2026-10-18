-- =============================================================================
-- Caller-principal-binding audit trail (caller-to-principal scoping)
-- =============================================================================
--
-- Backs CallerAuditEvent's new "caller.principal_denied" type and
-- `principal_id` field (packages/api/src/auth/CallerAuditSink.ts,
-- packages/api/src/routes/execute.ts / transactions.ts): an
-- authenticated caller attempting to assert an authority.principalId
-- outside its ApiKeyEntry.allowedPrincipalIds is denied, and that
-- denial is now audited the same way caller.capability_denied already
-- is (20260812120000_add_capability_to_caller_audit_events.sql).
--
-- Widens the type CHECK constraint from 20260812120000 to add the
-- new event type, mirroring that migration's own DROP/ADD CONSTRAINT
-- pattern, which itself mirrored 20260718190412's for
-- razorpay_webhook_audit_events. Adds `principal_id`, nullable and
-- additive like every prior column addition to this table
-- (signature_json, 20260802130000; capability, 20260812120000) --
-- existing rows are unaffected, every row written from here forward
-- that concerns a specific principal-binding denial carries it.

ALTER TABLE caller_audit_events
DROP CONSTRAINT IF EXISTS caller_audit_events_type_check;

ALTER TABLE caller_audit_events
ADD CONSTRAINT caller_audit_events_type_check
CHECK (type IN (
    'caller.authenticated',
    'caller.rejected',
    'caller.capability_denied',
    'caller.principal_denied'
));

ALTER TABLE caller_audit_events
ADD COLUMN IF NOT EXISTS principal_id TEXT;

CREATE INDEX IF NOT EXISTS idx_caller_audit_events_principal_id
ON caller_audit_events (
    principal_id
)
WHERE principal_id IS NOT NULL;
