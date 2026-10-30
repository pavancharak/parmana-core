-- =============================================================================
-- Revoked caller API keys (stage 1 of caller key revocation)
-- =============================================================================
--
-- Backs SupabaseCallerKeyRevocationRepository
-- (packages/storage/src/supabase/SupabaseCallerKeyRevocationRepository.ts).
-- The caller-auth layer reads this table on every request, so revoking a
-- key here takes effect on the next request, with no restart. Before this
-- table, a revoked key stayed valid until the server restarted with its
-- entry removed from PARMANA_API_KEYS.
--
-- Stores only the SHA-256 hash of each revoked key, never the key.
-- Append-only in practice: rows are inserted and never updated.

CREATE TABLE IF NOT EXISTS caller_key_revocations (

    key_hash TEXT PRIMARY KEY,

    caller_id TEXT NOT NULL,

    revoked_by TEXT NOT NULL,

    reason TEXT NOT NULL,

    revoked_at TIMESTAMPTZ NOT NULL

);

ALTER TABLE caller_key_revocations ENABLE ROW LEVEL SECURITY;
