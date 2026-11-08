-- =============================================================================
-- Outside agent registry (RFC-0024, option 3)
-- =============================================================================
--
-- Backs SupabaseAgentRegistryRepository
-- (packages/storage/src/supabase/SupabaseAgentRegistryRepository.ts).
-- Each outside agent has its own client id and secret hash. The token check reads
-- this table on every request, so a revocation takes effect on the next request.
--
-- Stores only the SHA-256 hash of each agent's client secret, never the secret.
-- The CHECK constraint enforces maker and checker: the person who registered an agent
-- cannot also approve it.

CREATE TABLE IF NOT EXISTS agents (

    agent_id TEXT PRIMARY KEY,

    client_id TEXT NOT NULL UNIQUE,

    client_secret_hash TEXT NOT NULL,

    partner_id TEXT NOT NULL,

    allowed_capabilities TEXT[],

    allowed_principal_ids TEXT[],

    allowed_tenant_ids TEXT[],

    registered_by TEXT NOT NULL,

    approved_by TEXT NOT NULL,

    registered_at TIMESTAMPTZ NOT NULL,

    revoked_at TIMESTAMPTZ,

    revoked_by TEXT,

    revoke_reason TEXT,

    CONSTRAINT agents_maker_checker CHECK (registered_by <> approved_by)

);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
