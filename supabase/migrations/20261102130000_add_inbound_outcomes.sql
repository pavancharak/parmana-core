-- =============================================================================
-- Inbound refund outcomes (RFC-0025)
-- =============================================================================
--
-- Backs SupabaseInboundOutcomeRepository. One row per decision: what happened to the refund after
-- Parmana issued the decision. The primary key makes a second outcome for the same decision fail.

CREATE TABLE IF NOT EXISTS inbound_outcomes (

    decision_id TEXT PRIMARY KEY REFERENCES inbound_decisions (decision_id),

    partner_id TEXT NOT NULL,

    order_id TEXT NOT NULL,

    payment_id TEXT NOT NULL,

    amount_inr NUMERIC NOT NULL,

    status TEXT NOT NULL CHECK (status IN ('refunded', 'refused', 'error')),

    refund_id TEXT,

    reason TEXT,

    recorded_at TIMESTAMPTZ NOT NULL

);

ALTER TABLE inbound_outcomes ENABLE ROW LEVEL SECURITY;
