-- =============================================================================
-- Drop orphaned Razorpay tables (Razorpay connector removed 2026-08-12)
-- =============================================================================
--
-- The Razorpay connector and its `payments:execute`/vendor-payment capability
-- were removed from this codebase entirely on 2026-08-12 (docs/CLAIMS.md,
-- docs/VERIFICATION-GAPS.md G-27) -- it was never a real, production-reachable
-- capability. The vendor-payment *policy file* and shared test fixtures using
-- it as generic example data were deliberately retained (no execution risk,
-- no connector able to back them) -- these three tables were not, and are
-- confirmed orphaned:
--
--   - razorpay_webhook_events (20260718182238_add_razorpay_webhook_tables.sql)
--   - razorpay_webhook_audit_events (same migration)
--   - razorpay_daily_refund_reservations (20260805170000_add_razorpay_daily_refund_reservations.sql)
--
-- Confirmed before dropping (2026-09-16):
--   - Only one file in packages/ references any of these table names at all
--     (packages/api/tests/integration/refusal-record.integration.test.ts),
--     incidentally, not as functional table access.
--   - razorpay_webhook_events and razorpay_daily_refund_reservations had zero
--     rows. razorpay_webhook_audit_events had 7 historical rows, backed up
--     before this migration ran (not committed to this repo -- historical
--     data, not schema).
--   - No foreign key from any other table references any of the three.
--
-- Order matters only for readability here -- no FK dependencies exist between
-- these three tables or from any other table onto them.

DROP TABLE IF EXISTS razorpay_daily_refund_reservations;

DROP TABLE IF EXISTS razorpay_webhook_audit_events;

DROP TABLE IF EXISTS razorpay_webhook_events;
