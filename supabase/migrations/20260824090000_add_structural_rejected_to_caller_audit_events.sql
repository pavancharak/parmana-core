-- =============================================================================
-- Structural-validation rejection audit trail (G-29)
-- =============================================================================
--
-- Backs CallerAuditEvent's new "caller.structural_rejected" type and
-- `business_transaction_id` field (packages/api/src/auth/CallerAuditSink.ts,
-- packages/api/src/middleware/error-handler.ts,
-- packages/api/src/routes/execute.ts / transactions.ts): before this
-- migration, a malformed request body, a malformed businessTransactionId,
-- a structurally invalid Business Transaction, or a duplicate
-- businessTransactionId was rejected with the correct HTTP status but left
-- no durable trace anywhere in this system — unlike a policy REJECT
-- (RefusalRecord, RFC-0021) or a caller-identity denial
-- (caller.capability_denied / caller.principal_denied), both already
-- audited.
--
-- Widens the type CHECK constraint from 20260818130000 to add the new
-- event type, mirroring every prior widening of this same constraint
-- (20260812120000, 20260816120000, 20260818130000, each mirroring
-- 20260718190412's for razorpay_webhook_audit_events in turn). Adds
-- `business_transaction_id`, nullable and additive like every prior
-- column addition to this table (signature_json, 20260802130000;
-- capability, 20260812120000; principal_id, 20260816120000) -- existing
-- rows are unaffected.

ALTER TABLE caller_audit_events
DROP CONSTRAINT IF EXISTS caller_audit_events_type_check;

ALTER TABLE caller_audit_events
ADD CONSTRAINT caller_audit_events_type_check
CHECK (type IN (
    'caller.authenticated',
    'caller.rejected',
    'caller.capability_denied',
    'caller.principal_denied',
    'caller.non_human_denied',
    'caller.structural_rejected'
));

ALTER TABLE caller_audit_events
ADD COLUMN IF NOT EXISTS business_transaction_id TEXT;

CREATE INDEX IF NOT EXISTS idx_caller_audit_events_business_transaction_id
ON caller_audit_events (
    business_transaction_id
)
WHERE business_transaction_id IS NOT NULL;
