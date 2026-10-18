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