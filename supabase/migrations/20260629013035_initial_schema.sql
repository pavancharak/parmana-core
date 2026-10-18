-- =============================================================================
-- Parmana Initial Schema
-- =============================================================================

CREATE TABLE IF NOT EXISTS business_transactions (

    business_transaction_id TEXT PRIMARY KEY,

    status TEXT NOT NULL,

    authority_json JSONB NOT NULL,

    authorization_json JSONB NOT NULL,

    intent_json JSONB NOT NULL,

    metadata_json JSONB NOT NULL,

    policy_json JSONB NOT NULL,

    signals_json JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL

);

CREATE TABLE IF NOT EXISTS execution_trust_records (

    trust_record_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL UNIQUE,

    transaction_json JSONB NOT NULL,

    trust_record_hash TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL,

    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_transaction
        FOREIGN KEY (
            business_transaction_id
        )
        REFERENCES business_transactions(
            business_transaction_id
        )
        ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS executions (

    execution_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL,

    execution_json JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_execution_transaction
        FOREIGN KEY (
            business_transaction_id
        )
        REFERENCES business_transactions(
            business_transaction_id
        )
        ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS overrides (

    override_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL,

    override_json JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_override_transaction
        FOREIGN KEY (
            business_transaction_id
        )
        REFERENCES business_transactions(
            business_transaction_id
        )
        ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS verifications (

    verification_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL,

    verification_json JSONB NOT NULL,

    verified_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_verification_transaction
        FOREIGN KEY (
            business_transaction_id
        )
        REFERENCES business_transactions(
            business_transaction_id
        )
        ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS receipts (

    receipt_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL,

    receipt_json JSONB NOT NULL,

    issued_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_receipt_transaction
        FOREIGN KEY (
            business_transaction_id
        )
        REFERENCES business_transactions(
            business_transaction_id
        )
        ON DELETE RESTRICT

);

CREATE INDEX IF NOT EXISTS idx_business_transactions_created_at
ON business_transactions (
    created_at
);

CREATE INDEX IF NOT EXISTS idx_execution_trust_records_transaction
ON execution_trust_records (
    business_transaction_id
);

CREATE INDEX IF NOT EXISTS idx_execution_transaction
ON executions (
    business_transaction_id
);

CREATE INDEX IF NOT EXISTS idx_executions_created_at
ON executions (
    created_at
);

CREATE INDEX IF NOT EXISTS idx_override_transaction
ON overrides (
    business_transaction_id
);

CREATE INDEX IF NOT EXISTS idx_verification_transaction
ON verifications (
    business_transaction_id
);

CREATE INDEX IF NOT EXISTS idx_verifications_verified_at
ON verifications (
    verified_at
);

CREATE INDEX IF NOT EXISTS idx_receipt_transaction
ON receipts (
    business_transaction_id
);

CREATE INDEX IF NOT EXISTS idx_receipts_issued_at
ON receipts (
    issued_at
);