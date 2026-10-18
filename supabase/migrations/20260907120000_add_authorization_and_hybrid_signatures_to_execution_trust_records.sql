-- =============================================================================
-- Persist Signed Execution Authorization + Hybrid Signatures on
-- execution_trust_records
--
-- authorization_json: the SignedExecutionAuthorization ExecutionGateway
-- accepted for this transaction (ExecutionTrustRecord.authorization).
-- Nullable: absent for records built before this column existed, or for
-- a transaction that never reached execution (e.g. a policy rejection).
--
-- schema_version / signatures_json: ExecutionTrustRecord.schemaVersion /
-- .signatures, added by the Hybrid Signature Support milestone
-- (20260702183000_add_signature_to_execution_trust_records.sql added
-- signature_json for the legacy single signature, but schemaVersion/
-- signatures were never given columns here -- a CRYPTO_MODE=hybrid
-- record round-tripped through Supabase silently lost its second
-- signature on read, degrading hybrid verification to single-signature
-- for anything reloaded from durable storage). Both nullable for the
-- same reason: absent means schema v1 (see execution-trust-record.ts's
-- own doc comment on schemaVersion), not "hybrid signing failed."
-- =============================================================================

ALTER TABLE execution_trust_records
ADD COLUMN IF NOT EXISTS authorization_json JSONB;

ALTER TABLE execution_trust_records
ADD COLUMN IF NOT EXISTS schema_version INTEGER;

ALTER TABLE execution_trust_records
ADD COLUMN IF NOT EXISTS signatures_json JSONB;

CREATE INDEX IF NOT EXISTS idx_execution_trust_records_authorization
ON execution_trust_records
USING GIN (authorization_json);
