-- =============================================================================
-- CI read-only access to Policy Change Approval Records (Policy
-- Governance, maker-checker, preventive CI/deploy-time gate)
-- =============================================================================
--
-- Backs scripts/verify-policy-changes-approved.ts: a CI check that
-- confirms every changed policies/{name}/{version}/policy.json in a
-- PR has a matching, real PolicyChangeApprovalRecord before it can
-- merge -- closing the gap the independent audit found, that a direct
-- file edit to policies/*.json bypasses the maker-checker API
-- entirely and is only ever *detected*, after the fact, by
-- verifyPolicyGovernanceIntegrityAtStartup.ts's own fail-open startup
-- check, never prevented.
--
-- policy_change_approval_records already has ENABLE ROW LEVEL
-- SECURITY (20260818120000) with zero policies -- meaning, before
-- this migration, it is unreadable by every role except one with
-- BYPASSRLS (the app's own DATABASE_URL connection). CI has never had
-- any Supabase credential at all (see .github/workflows/ci.yml). Deliberately
-- NOT reusing the app's own DATABASE_URL or SUPABASE_SERVICE_ROLE_KEY for
-- this -- both bypass RLS entirely and grant read+write on every table in
-- the schema, not read-only access to this one. This migration adds the
-- single minimal policy needed instead: read-only, this table only, via
-- the low-privilege `anon` role and SUPABASE_ANON_KEY -- a new credential
-- CI is given for the first time here, scoped to exactly this and nothing
-- else, so a leak of it (CI logs, a compromised workflow) cannot write
-- anything or read any other table.
--
-- The explicit GRANT below is defensive, not strictly required under
-- Supabase's own default project bootstrapping (which already grants
-- anon/authenticated base SELECT on public-schema tables; RLS is what
-- was actually blocking reads here) -- included so this migration is
-- correct and self-contained even against a non-default grant setup,
-- consistent with this file's own "safe to re-run, nothing assumed"
-- convention.

GRANT SELECT ON policy_change_approval_records TO anon;

-- Postgres has no CREATE POLICY IF NOT EXISTS -- drop-then-create,
-- the same self-guarding re-run pattern this file's own header
-- comment documents for constraints.
DROP POLICY IF EXISTS "ci_read_only_select" ON policy_change_approval_records;

CREATE POLICY "ci_read_only_select" ON policy_change_approval_records
    FOR SELECT
    TO anon
    USING (true);
