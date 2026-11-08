-- =============================================================================
-- Inbound decisions for any action, not only refunds (RFC-0024, RFC-0025)
-- =============================================================================
--
-- Lets inbound_decisions record a decision for any capability and carry the
-- fields RFC-0024 question 6 requires. Additive: no existing row is changed,
-- and no column is dropped.
--
-- Changes:
--   * payment_id and limit_inr stop being required. Refund rows keep both;
--     other actions have neither.
--   * New nullable columns hold the proposed action (capability, target,
--     amount), the policy and version that applied, and who approved it.
--
-- Rollback (only if no row uses the new columns or a null in the old ones):
--   ALTER TABLE inbound_decisions
--     DROP COLUMN capability, DROP COLUMN target, DROP COLUMN amount,
--     DROP COLUMN policy_name, DROP COLUMN policy_version,
--     DROP COLUMN approved_by, DROP COLUMN approved_at,
--     DROP COLUMN check_status;
--   ALTER TABLE inbound_decisions ALTER COLUMN payment_id SET NOT NULL,
--     ALTER COLUMN limit_inr SET NOT NULL;

ALTER TABLE inbound_decisions
    ALTER COLUMN payment_id DROP NOT NULL,
    ALTER COLUMN limit_inr DROP NOT NULL;

ALTER TABLE inbound_decisions
    ADD COLUMN IF NOT EXISTS capability TEXT,
    ADD COLUMN IF NOT EXISTS target TEXT,
    ADD COLUMN IF NOT EXISTS amount NUMERIC,
    ADD COLUMN IF NOT EXISTS policy_name TEXT,
    ADD COLUMN IF NOT EXISTS policy_version TEXT,
    ADD COLUMN IF NOT EXISTS approved_by TEXT,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS check_status TEXT
        CHECK (check_status IN ('verified', 'not_verified'));
