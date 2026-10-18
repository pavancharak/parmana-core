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