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
