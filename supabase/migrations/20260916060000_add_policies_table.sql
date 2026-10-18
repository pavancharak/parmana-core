-- =============================================================================
-- Policy content storage (Supabase-backed PolicyRepository)
--
-- Policies were previously stored only as policy.json files under
-- PARMANA_POLICY_DIR (FilePolicyRepository). That works for local
-- development, but Vercel's serverless Functions run on a read-only
-- filesystem: PolicyChangeApprovalService.approve()'s live-policy
-- write (see that file's own doc comment) fails with EROFS the moment
-- a checker approves a pending change in production. This table gives
-- SupabasePolicyRepository somewhere writable to persist the same
-- (name, version) -> content mapping FilePolicyRepository already
-- modeled, so approve() succeeds against the deployed API the same
-- way it already does in local dev and tests.
-- =============================================================================

CREATE TABLE IF NOT EXISTS policies (

    policy_name TEXT NOT NULL,

    policy_version TEXT NOT NULL,

    content_json JSONB NOT NULL,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (policy_name, policy_version)

);

ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
