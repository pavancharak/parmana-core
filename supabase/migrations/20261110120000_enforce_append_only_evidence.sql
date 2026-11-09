-- =============================================================================
-- Evidence tables are append-only, enforced by the database (ADR-0021, step 4)
-- =============================================================================
--
-- Until now "append-only" was a convention, stated in comments and kept by the
-- application code. Nothing stopped a row from being updated or deleted through
-- SQL. This migration makes it a rule the database enforces:
--
--   1. A BEFORE UPDATE OR DELETE trigger raises an exception on each row, and a
--      BEFORE TRUNCATE trigger refuses the statement. The rule applies to every
--      role that does not disable the trigger, including the table owner.
--   2. UPDATE, DELETE and TRUNCATE are revoked from the public API roles
--      (anon, authenticated, PUBLIC) where those roles exist, so a request
--      through a platform API cannot reach these tables at all.
--
-- What this does not stop: a superuser, or the table owner, can run
-- ALTER TABLE ... DISABLE TRIGGER and then change rows. The hash chain is what
-- makes that visible. A chain edit or deletion breaks verification, and the
-- chain head is anchored outside the database (ADR-0021, step 5). The database
-- rule and the chain cover different adversaries, and both are needed.
--
-- Tables covered: the chained audit trails and the refusal record. Each is only
-- ever inserted by its sink (PostgresCallerAuditSink, PostgresExecutionAuditSink,
-- PostgresPolicyChangeApprovalRecordRepository, PostgresRefusalRecordRepository).
-- Trust record headers and their executions are not covered yet: their
-- repositories update them (touch(), and the deprecated replaceExecution()).
--
-- Safe to re-run: triggers are dropped and created again, and REVOKE is
-- idempotent.

CREATE OR REPLACE FUNCTION parmana_reject_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION '% is append-only: % is not allowed on it', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$;

DO $$
DECLARE
    evidence_table TEXT;
BEGIN
    FOREACH evidence_table IN ARRAY ARRAY[
        'caller_audit_events',
        'execution_audit_events',
        'policy_change_approval_records',
        'refusal_records'
    ]
    LOOP
        IF to_regclass(evidence_table) IS NULL THEN
            CONTINUE;
        END IF;

        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON %I',
            evidence_table || '_append_only_row', evidence_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I
               FOR EACH ROW EXECUTE FUNCTION parmana_reject_evidence_mutation()',
            evidence_table || '_append_only_row', evidence_table
        );

        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON %I',
            evidence_table || '_append_only_truncate', evidence_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE TRUNCATE ON %I
               FOR EACH STATEMENT EXECUTE FUNCTION parmana_reject_evidence_mutation()',
            evidence_table || '_append_only_truncate', evidence_table
        );

        -- Public API roles, where the platform defines them (Supabase does;
        -- plain PostgreSQL usually does not).
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM anon', evidence_table);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM authenticated', evidence_table);
        END IF;
        EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM PUBLIC', evidence_table);
    END LOOP;
END;
$$;
