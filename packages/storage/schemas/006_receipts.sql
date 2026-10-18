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
