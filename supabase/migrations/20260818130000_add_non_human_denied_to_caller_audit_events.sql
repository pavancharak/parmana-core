-- =============================================================================
-- Non-human-caller-denied audit trail (Policy Governance, maker-checker)
-- =============================================================================
--
-- Backs CallerAuditEvent's new "caller.non_human_denied" type and
-- `severity` field (packages/api/src/auth/CallerAuditSink.ts,
-- packages/api/src/routes/pending-policy-changes.ts): a caller whose
-- credential is not provisioned as a verified human
-- (ApiKeyEntry.credentialHolderType !== "USER", see isHumanCaller.ts)
-- attempting one of the four Policy Governance endpoints is denied,
-- and that denial is now audited the same way caller.capability_denied
-- and caller.principal_denied already are.
--
-- Widens the type CHECK constraint from 20260816120000 to add the new
-- event type, mirroring that migration's own DROP/ADD CONSTRAINT
-- pattern. Adds `severity`, nullable and additive like every prior
-- column addition to this table (signature_json, 20260802130000;
-- capability, 20260812120000; principal_id, 20260816120000) --
-- existing rows are unaffected. Mirrors the elevated-severity marker
-- already established for razorpay_webhook_audit_events
-- (20260718190412_add_settlement_confirmations_and_audit_severity.sql)
-- rather than inventing a second convention for the same concept.

ALTER TABLE caller_audit_events
DROP CONSTRAINT IF EXISTS caller_audit_events_type_check;

ALTER TABLE caller_audit_events
ADD CONSTRAINT caller_audit_events_type_check
CHECK (type IN (
    'caller.authenticated',
    'caller.rejected',
    'caller.capability_denied',
    'caller.principal_denied',
    'caller.non_human_denied'
));

ALTER TABLE caller_audit_events
ADD COLUMN IF NOT EXISTS severity TEXT;

CREATE INDEX IF NOT EXISTS idx_caller_audit_events_severity
ON caller_audit_events (
    severity
)
WHERE severity IS NOT NULL;
