-- =============================================================================
-- Razorpay daily cumulative refund reservation ledger (TD-23 closure, Phase 3B)
-- =============================================================================
--
-- Backs RazorpayDailyRefundLedger's atomic reserve()/release() operations
-- (packages/storage/src/supabase/SupabaseRazorpayDailyRefundLedger.ts).
--
-- Closes an independently-verified gap (Phase 2L, Phase 3A): the
-- razorpay-refund/1.0.0 policy's daily cumulative cap was previously
-- enforced against a caller-declared signal
-- (dailyCumulativeAfterThisRefundPaise) with no independent verification --
-- a caller could declare any value regardless of real refund history.
--
-- This is a single-row-per-day atomic counter, not a transaction ledger or a
-- duplicate of Trust Record history: it stores nothing about individual
-- refunds, only a running total per UTC calendar day. The authoritative
-- record of what actually executed remains the existing executions table
-- (see ExecutionTrustRecordRepository.sumSuccessfulExecutionAmounts, added
-- alongside this migration for reconciliation/observability) -- this table
-- exists solely to make "read the current total, then decide, then commit"
-- atomic across concurrent requests, which a SELECT-then-write over the
-- executions table cannot be, since a real Razorpay API call (which cannot
-- be wrapped in a database transaction) sits between the decision and the
-- executions row that would eventually record it.
--
-- Atomicity: reserve() is a single INSERT ... ON CONFLICT (refund_day) DO
-- UPDATE ... RETURNING statement. Two concurrent reservations for the same
-- day are serialized by Postgres's own row lock on that day's row -- the
-- same class of atomicity consumed_nonces's and razorpay_webhook_events's
-- primary keys already provide for uniqueness checks, applied here to an
-- additive counter instead.

CREATE TABLE IF NOT EXISTS razorpay_daily_refund_reservations (

    refund_day DATE PRIMARY KEY,

    reserved_paise BIGINT NOT NULL DEFAULT 0,

    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_reserved_paise_non_negative CHECK (reserved_paise >= 0)

);

ALTER TABLE razorpay_daily_refund_reservations ENABLE ROW LEVEL SECURITY;
