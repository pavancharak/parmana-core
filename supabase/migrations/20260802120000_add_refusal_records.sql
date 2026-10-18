-- =============================================================================
-- RFC-0021
-- Refusal Records: durable, signed, third-party-verifiable evidence
-- of a policy REJECT.
-- =============================================================================
--
-- Scope is deliberately narrow: this table holds evidence for
-- PolicyEngine.evaluate REJECTs and SignalIntentBinder
-- binding-violation REJECTs only (see RuntimeEngine.execute()'s
-- writeRefusalRecord() call site) -- not caller-auth failures or
-- webhook signature failures (a separate, unsigned audit-sink
-- milestone: caller_audit_events / razorpay_webhook_audit_events).
--
-- signature_json is NOT NULL, unlike execution_trust_records'
-- (added later, nullable, via a retrofit migration) -- Refusal
-- Records ship signed from the start, no retrofit period.

CREATE TABLE IF NOT EXISTS refusal_records (

    refusal_record_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL UNIQUE,

    decision_json JSONB NOT NULL,

    evaluated_intent_json JSONB NOT NULL,

    binding_violations_json JSONB,

    submitted_by TEXT,

    refusal_record_hash TEXT NOT NULL,

    signature_json JSONB NOT NULL,

    -- Retention: currently indefinite, same policy as
    -- execution_trust_records. Revisit if REJECT volume ever grows
    -- significantly (RFC-0021 Open Question 3) -- not addressed by
    -- this migration.
    created_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_refusal_transaction
        FOREIGN KEY (
            business_transaction_id
        )
        REFERENCES business_transactions(
            business_transaction_id
        )
        ON DELETE RESTRICT

);

CREATE INDEX IF NOT EXISTS idx_refusal_records_created_at
ON refusal_records (
    created_at
);

ALTER TABLE refusal_records ENABLE ROW LEVEL SECURITY;
