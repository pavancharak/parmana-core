-- =============================================================================
-- Drop the unused settlement_confirmations table
-- =============================================================================
--
-- Created by 20260718190412_add_settlement_confirmations_and_audit_severity.sql
-- for appendSettlementConfirmation, whose only caller was
-- RazorpaySettlementProcessor.ts. That processor was removed with the Razorpay
-- connector, so nothing in this repository writes or reads the table.
--
-- Confirmed before dropping (2026-10-30): the live table has 0 rows.
--
-- The sandbox retention job (deploy/sandbox/retention.sql) also deleted from
-- it; that step is removed in the same change.

DROP TABLE IF EXISTS settlement_confirmations;
