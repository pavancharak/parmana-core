-- =============================================================================
-- Policy approval records: read by the policy reader role only (ADR-0021)
-- =============================================================================
--
-- Until now the public anon role could read policy_change_approval_records, through
-- the policy created in 20260818150000 and the grant in the same file. The
-- deploy-time approval check verified the approval log offline, and the export and
-- drift check read the table through the read only role named in CI_DATABASE_URL.
-- Nothing reads the table through the anon role any more, so that access is removed.
--
-- This migration:
--   1. creates a group role, parmana_policy_reader, with no login. It is the only
--      role with a read policy on this table.
--   2. replaces the anon policy with one for that group role.
--   3. revokes the anon grant.
--
-- A login role, such as the one in CI_DATABASE_URL, gets read access by being made
-- a member of the group role:  GRANT parmana_policy_reader TO <login role>;
-- That grant is an operator step, not part of this migration, because it names a
-- login role and a password is never written in a migration.
--
-- Safe to re-run.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'parmana_policy_reader') THEN
        CREATE ROLE parmana_policy_reader NOLOGIN;
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO parmana_policy_reader;
GRANT SELECT ON policy_change_approval_records TO parmana_policy_reader;

DROP POLICY IF EXISTS "ci_read_only_select" ON policy_change_approval_records;
DROP POLICY IF EXISTS "policy_reader_select" ON policy_change_approval_records;
CREATE POLICY "policy_reader_select" ON policy_change_approval_records
    FOR SELECT TO parmana_policy_reader USING (true);

REVOKE SELECT ON policy_change_approval_records FROM anon;
