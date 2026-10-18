-- =============================================================================
-- ADR-0012
-- Execution Intents: a signed statement, persisted BEFORE an action is released
-- to a connector, of exactly what is about to be released.
-- =============================================================================
--
-- Why this exists: the Execution Trust Record contains the execution result, so
-- it can only be built after release. If it cannot be built or stored, an
-- executed action has no signed record (docs/VERIFICATION-GAPS.md G-52 and
-- G-53). The intent is signed and stored first, so an action that was released
-- always has signed evidence behind it.
--
-- Two kinds of column live here on purpose:
--
--   * The signed intent (intent_id through created_at, plus intent_hash and
--     signature_json). Immutable. It never contains the execution result or the
--     raw intent parameters.
--   * Operational status (state and everything after it). NOT signed. It moves
--     as the request progresses and is what the repair operation reads.
--
-- released_context_json holds the execution context saved right after the
-- connector answered. It is what lets the Trust Record be rebuilt when the
-- record could not be produced inline, without calling the connector again.
--
-- This migration only adds a table. It changes no existing table, and
-- transactions that predate it simply have no intent row.

CREATE TABLE IF NOT EXISTS execution_intents (

    intent_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL UNIQUE,

    decision_id TEXT NOT NULL,

    authorization_id TEXT NOT NULL,

    policy_name TEXT NOT NULL,

    policy_version TEXT NOT NULL,

    policy_content_hash TEXT,

    signals_hash TEXT,

    business_transaction_hash TEXT NOT NULL,

    action TEXT NOT NULL,

    target TEXT NOT NULL,

    submitted_by TEXT,

    granted_capability TEXT,

    intent_hash TEXT NOT NULL,

    signature_json JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL,

    -- Operational status below this line. Not part of the signature.

    state TEXT NOT NULL DEFAULT 'PREPARED'
        CHECK (state IN ('PREPARED', 'RELEASED', 'FINALIZED', 'ERRORED', 'RESOLVED')),

    released_context_json JSONB,

    released_at TIMESTAMPTZ,

    finalized_at TIMESTAMPTZ,

    finalization_mode TEXT
        CHECK (finalization_mode IN ('INLINE', 'REPAIRED')),

    trust_record_id TEXT,

    failure_reason TEXT,

    -- Set only when a verified human closed a PREPARED or ERRORED intent after
    -- reconciling it at the connector (state RESOLVED). This is an attributed
    -- operator statement in unsigned status. It is not tamper evident.
    resolution TEXT
        CHECK (resolution IN ('NOT_EXECUTED', 'EXECUTED')),

    resolution_note TEXT,

    resolved_by TEXT,

    resolved_at TIMESTAMPTZ,

    CONSTRAINT execution_intent_resolved_is_complete
        CHECK (
            state <> 'RESOLVED'
            OR (
                resolution IS NOT NULL
                AND resolution_note IS NOT NULL
                AND resolved_at IS NOT NULL
            )
        ),

    CONSTRAINT fk_execution_intent_transaction
        FOREIGN KEY (
            business_transaction_id
        )
        REFERENCES business_transactions(
            business_transaction_id
        )
        ON DELETE RESTRICT

);

-- Operators look for intents that never reached a signed Trust Record and were
-- not closed by hand. A partial index keeps that lookup cheap without indexing
-- every finalized or resolved row.
CREATE INDEX IF NOT EXISTS idx_execution_intents_unfinalized
ON execution_intents (
    created_at
)
WHERE state NOT IN ('FINALIZED', 'RESOLVED');

ALTER TABLE execution_intents ENABLE ROW LEVEL SECURITY;
