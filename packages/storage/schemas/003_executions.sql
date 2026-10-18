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
