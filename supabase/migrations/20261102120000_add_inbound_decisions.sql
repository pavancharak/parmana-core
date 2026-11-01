-- =============================================================================
-- Inbound refund decisions (RFC-0025)
-- =============================================================================
--
-- Backs SupabaseInboundDecisionRepository. Each row is a decision Parmana issued for an inbound
-- refund request, approved or rejected, with Parmana's signature. Append-only in practice:
-- rows are inserted and never updated. The primary key makes a duplicate insert fail.

CREATE TABLE IF NOT EXISTS inbound_decisions (

    decision_id TEXT PRIMARY KEY,

    outcome TEXT NOT NULL CHECK (outcome IN ('approved', 'rejected')),

    reason TEXT,

    partner_id TEXT NOT NULL,

    payment_id TEXT NOT NULL,

    limit_inr NUMERIC NOT NULL,

    expires_at TIMESTAMPTZ NOT NULL,

    audience TEXT NOT NULL,

    signature TEXT NOT NULL,

    issued_at TIMESTAMPTZ NOT NULL

);

ALTER TABLE inbound_decisions ENABLE ROW LEVEL SECURITY;
