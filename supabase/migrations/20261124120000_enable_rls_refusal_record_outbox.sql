-- =============================================================================
-- Refusal Record outbox: row level security
-- =============================================================================
--
-- 20261123120000_add_refusal_record_outbox.sql created refusal_record_outbox
-- without row level security. Its rows hold the full decision, the evaluated
-- intent, binding violations and the submitter, the same data refusal_records
-- holds, and refusal_records has RLS enabled (20260802120000).
--
-- This migration enables RLS on the table, as refusal_records does. The table
-- has no policies, so a role other than the owner gets no rows. The owner
-- (the role that runs migrations and the service's own connection) is not
-- subject to RLS unless FORCE is set, which it is not here.
--
-- It also revokes table privileges from the Supabase API roles, so a key for
-- those roles cannot read or write the table through the API. The revoke is
-- skipped for a role that does not exist, so the migration also runs on plain
-- PostgreSQL.

ALTER TABLE refusal_record_outbox ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON refusal_record_outbox FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON refusal_record_outbox FROM authenticated;
    END IF;
END
$$;
