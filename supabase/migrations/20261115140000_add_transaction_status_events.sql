-- =============================================================================
-- Transaction status events (decision D23, design section 3 and 7)
-- =============================================================================
--
-- A business transaction's status is recorded as append-only events, not as an
-- updatable column. The business_transactions row is never changed after
-- acceptance, so the signed records that refer to it stay exactly as accepted.
-- The current status of a transaction is the event with the highest sequence.
--
-- Each event is written by the stage that produced it (declare, decide, sign,
-- execute, verify, reconcile), in the same database transaction as that stage's
-- own record. A stage that fails writes neither.
--
-- Legacy rows: every business transaction that existed before this migration
-- gets one RECEIVED event, marked legacy = true. Its later status is not
-- derived, so no reader takes it as fully traced.
--
-- The status values are the ones kept by decision D23 section 7a. OVERRIDDEN
-- is not one of them.
--
-- Protection: the same as the other evidence tables (migration
-- 20261110120000). Updates, deletes and truncation are refused by trigger, and
-- the public API roles are revoked.

CREATE TABLE IF NOT EXISTS transaction_status_events (

    event_id UUID PRIMARY KEY,

    business_transaction_id TEXT NOT NULL
        REFERENCES business_transactions (business_transaction_id),

    -- Order of events for one transaction. Assigned by the writer while it
    -- holds the transaction's row lock (D23 section 7a, decision 4).
    sequence BIGINT NOT NULL,

    status TEXT NOT NULL CHECK (status IN (
        'RECEIVED',
        'POLICY_EVALUATED',
        'APPROVED',
        'REJECTED',
        'EXECUTING',
        'EXECUTED',
        'FAILED',
        'VERIFIED'
    )),

    stage TEXT NOT NULL CHECK (stage IN (
        'declare',
        'decide',
        'sign',
        'execute',
        'verify',
        'reconcile'
    )),

    occurred_at TIMESTAMPTZ NOT NULL,

    -- The record the stage produced: a refusal record, a trust record, an
    -- execution outcome, or the attested outcome of an operator. Nullable for
    -- events that produce no record.
    record_ref TEXT,

    -- Why, for failure and refusal events. Required for FAILED.
    reason TEXT,

    -- True only for the RECEIVED events written by this migration.
    legacy BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT transaction_status_events_sequence_unique
        UNIQUE (business_transaction_id, sequence),

    CONSTRAINT transaction_status_events_failed_has_reason
        CHECK (status <> 'FAILED' OR reason IS NOT NULL),

    CONSTRAINT transaction_status_events_legacy_is_received
        CHECK (NOT legacy OR (status = 'RECEIVED' AND stage = 'declare'))
);

-- The current status is read by business_transaction_id, newest sequence first.
CREATE INDEX IF NOT EXISTS idx_transaction_status_events_current
    ON transaction_status_events (business_transaction_id, sequence DESC);

-- Backfill: one RECEIVED event per existing business transaction, at the time
-- it was created. Appended here, before the protection below is in place.
INSERT INTO transaction_status_events
    (event_id, business_transaction_id, sequence, status, stage, occurred_at, legacy)
SELECT
    gen_random_uuid(),
    bt.business_transaction_id,
    1,
    'RECEIVED',
    'declare',
    bt.created_at,
    true
FROM business_transactions bt
WHERE NOT EXISTS (
    SELECT 1 FROM transaction_status_events e
    WHERE e.business_transaction_id = bt.business_transaction_id
);

-- Protection, the same as the other evidence tables.
DROP TRIGGER IF EXISTS transaction_status_events_append_only_row ON transaction_status_events;
CREATE TRIGGER transaction_status_events_append_only_row
    BEFORE UPDATE OR DELETE ON transaction_status_events
    FOR EACH ROW EXECUTE FUNCTION parmana_reject_evidence_mutation();

DROP TRIGGER IF EXISTS transaction_status_events_append_only_truncate ON transaction_status_events;
CREATE TRIGGER transaction_status_events_append_only_truncate
    BEFORE TRUNCATE ON transaction_status_events
    FOR EACH STATEMENT EXECUTE FUNCTION parmana_reject_evidence_mutation();

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE UPDATE, DELETE, TRUNCATE ON transaction_status_events FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE UPDATE, DELETE, TRUNCATE ON transaction_status_events FROM authenticated;
    END IF;
END;
$$;

REVOKE UPDATE, DELETE, TRUNCATE ON transaction_status_events FROM PUBLIC;

ALTER TABLE transaction_status_events ENABLE ROW LEVEL SECURITY;
