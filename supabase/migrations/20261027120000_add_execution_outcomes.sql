-- =============================================================================
-- Execution outcome record (G-125, docs/VERIFICATION-GAPS.md)
-- =============================================================================
--
-- Backs SupabaseExecutionOutcomeStore. One row per authorization nonce,
-- recording what the connector returned, so a retry after a lost response can
-- return the result or report the outcome as unknown, instead of being refused
-- with no information.
--
-- Separate from consumed_nonces on purpose. consumed_nonces is append-only and
-- only answers "was this nonce used." This table answers "what happened when
-- it was used," and its rows change state (in_flight -> completed).
--
-- Status values:
--   in_flight  the nonce was consumed and the connector was (or may have been)
--              called. The effect may or may not have happened.
--   completed  the connector returned. `result` holds the ExecutionResult.
-- A 'failed' state is not written yet. It is added with the reconciler (G-125
-- Part 3).
--
-- The PRIMARY KEY on `nonce` makes the first insert the only winner. No
-- PII: the nonce is an opaque single-use token. The result may contain
-- connector response data, so it is stored only in this table, under RLS.

CREATE TABLE IF NOT EXISTS execution_outcomes (

    nonce TEXT PRIMARY KEY,

    status TEXT NOT NULL CHECK (status IN ('in_flight', 'completed')),

    result JSONB,

    -- From the authorization's own expiresAt. Used by the retention job.
    expires_at TIMESTAMPTZ NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CHECK (status <> 'completed' OR result IS NOT NULL)

);

CREATE INDEX IF NOT EXISTS idx_execution_outcomes_expires_at
ON execution_outcomes (
    expires_at
);

ALTER TABLE execution_outcomes ENABLE ROW LEVEL SECURITY;
