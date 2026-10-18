-- =============================================================================
-- RFC-0020
-- Persist Trust Record Signature
-- =============================================================================

ALTER TABLE execution_trust_records
ADD COLUMN IF NOT EXISTS signature_json JSONB;

CREATE INDEX IF NOT EXISTS idx_execution_trust_records_signature
ON execution_trust_records
USING GIN (signature_json);