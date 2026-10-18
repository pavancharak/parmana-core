-- =============================================================================
-- Settlement confirmations and audit severity (M4b)
-- =============================================================================
--
-- Backs the durable, Supabase-backed settlement-confirmation infrastructure
-- introduced this session: packages/storage/src/supabase/
-- SupabaseExecutionTrustRecordRepository.ts's appendSettlementConfirmation,
-- and two new columns/values on the M4a webhook audit trail
-- (20260718182238_add_razorpay_webhook_tables.sql) to record settlement
-- PROCESSING outcomes, not just webhook DELIVERY outcomes.

-- -----------------------------------------------------------------------------
-- settlement_confirmations
-- -----------------------------------------------------------------------------
--
-- Append-only, mirrors the receipts table's shape exactly (see
-- 20260629013035_initial_schema.sql) — one row per SettlementConfirmation,
-- the full signed artifact stored verbatim in confirmation_json, plus a few
-- indexed columns for lookup. A row here is never mutated or deleted: the
-- Execution Trust Record's own trustRecordHash/signature and every existing
-- Receipt remain exactly as they were before this table existed.

CREATE TABLE IF NOT EXISTS settlement_confirmations (

    confirmation_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL,

    confirmation_json JSONB NOT NULL,

    issued_at TIMESTAMPTZ NOT NULL,

    seq BIGSERIAL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX IF NOT EXISTS idx_settlement_confirmations_business_transaction_id
ON settlement_confirmations (
    business_transaction_id
);

ALTER TABLE settlement_confirmations ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- razorpay_webhook_audit_events: settlement processing outcomes
-- -----------------------------------------------------------------------------
--
-- Widens the type CHECK constraint from 20260718182238 to add the four
-- settlement.* outcomes (settlement processing is a separate, out-of-band
-- step from webhook delivery — see packages/api/src/webhooks/
-- RazorpaySettlementProcessor.ts), and adds severity (elevated-severity
-- marker for settlement.failed / settlement.park_exhausted — "a refund's
-- lifecycle did not close cleanly," never silence), confirmation_id, and
-- fetched_refund_status (the fetch-verified, not webhook-claimed, status).

ALTER TABLE razorpay_webhook_audit_events
DROP CONSTRAINT IF EXISTS razorpay_webhook_audit_events_type_check;

ALTER TABLE razorpay_webhook_audit_events
ADD CONSTRAINT razorpay_webhook_audit_events_type_check
CHECK (type IN (
    'webhook.received',
    'webhook.duplicate',
    'webhook.rejected',
    'settlement.confirmed',
    'settlement.failed',
    'settlement.parked',
    'settlement.park_exhausted'
));

ALTER TABLE razorpay_webhook_audit_events
ADD COLUMN IF NOT EXISTS severity TEXT;

ALTER TABLE razorpay_webhook_audit_events
ADD COLUMN IF NOT EXISTS confirmation_id TEXT;

ALTER TABLE razorpay_webhook_audit_events
ADD COLUMN IF NOT EXISTS fetched_refund_status TEXT;

CREATE INDEX IF NOT EXISTS idx_razorpay_webhook_audit_events_severity
ON razorpay_webhook_audit_events (
    severity
)
WHERE severity IS NOT NULL;
