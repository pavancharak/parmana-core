-- =============================================================================
-- Refusal Record outbox (RFC-0021)
-- =============================================================================
--
-- A refusal is never blocked by its evidence. When writing the Refusal Record
-- fails at the time of the refusal, the inputs needed to build it are saved
-- here, and a background drain writes the record later. Entries are removed
-- from the pending set once delivered. The table is append-only in practice:
-- rows are updated only to record delivery or a failed attempt.
--
-- Known limit: if the database itself is unreachable when a refusal happens,
-- this table cannot be written either. That case is logged and counted, and
-- the refusal still takes effect.

CREATE TABLE IF NOT EXISTS refusal_record_outbox (

    business_transaction_id TEXT PRIMARY KEY,

    decision_json JSONB NOT NULL,

    evaluated_intent_json JSONB NOT NULL,

    binding_violations_json JSONB,

    submitted_by TEXT,

    policy_content_hash TEXT,

    enqueued_at TIMESTAMPTZ NOT NULL,

    attempts INTEGER NOT NULL DEFAULT 0,

    last_error TEXT,

    delivered_at TIMESTAMPTZ

);

-- Drain scans only undelivered rows, oldest first.
CREATE INDEX IF NOT EXISTS refusal_record_outbox_pending_idx
    ON refusal_record_outbox (enqueued_at)
    WHERE delivered_at IS NULL;
