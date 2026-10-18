-- =============================================================================
-- Audit-sink signing milestone (follows RFC-0021's Refusal Records)
-- =============================================================================
--
-- Adds a signature to the two existing durable audit trails
-- (caller_audit_events, razorpay_webhook_audit_events). Previously
-- these were plain rows: durable, but anyone with database access
-- could alter one with no way to detect it. SupabaseCallerAuditSink
-- and SupabaseRazorpayWebhookAuditSink now sign every event at write
-- time with the same key (DEFAULT_KEY_ID) ExecutionTrustRecord and
-- RefusalRecord already use — see @parmana/crypto's AuditEventCrypto.
--
-- Nullable, matching execution_trust_records.signature_json's own
-- precedent: both tables already had rows before this migration, and
-- this is additive, not a backfill. Existing rows remain unsigned,
-- honestly — every row written from here forward is signed.
--
-- Scope note: this does NOT cover policy/binding REJECTs
-- (PolicyEngine.evaluate, SignalIntentBinder) — those are
-- refusal_records (RFC-0021), a separate table and milestone.

ALTER TABLE caller_audit_events
ADD COLUMN IF NOT EXISTS signature_json JSONB;

ALTER TABLE razorpay_webhook_audit_events
ADD COLUMN IF NOT EXISTS signature_json JSONB;
