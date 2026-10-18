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
