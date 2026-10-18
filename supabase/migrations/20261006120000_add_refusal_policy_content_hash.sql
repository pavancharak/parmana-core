-- Refusal Records carry the hash of the policy content that decided them,
-- the same value an Execution Trust Record carries in
-- transaction.policy.contentHash. Nullable: Refusal Records written before
-- this column existed have no hash and still verify.

ALTER TABLE refusal_records
    ADD COLUMN IF NOT EXISTS policy_content_hash TEXT;
