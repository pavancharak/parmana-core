-- =============================================================================
-- Fix: caller.capability_granted was never a valid caller_audit_events.type
-- =============================================================================
--
-- packages/api/src/routes/execute.ts and transactions.ts (see
-- docs/VERIFICATION-GAPS.md gap 33 / docs/CLAIMS.md NF-004) both write a
-- "caller.capability_granted" CallerAuditEvent on every successful,
-- authenticated capability check -- but no prior migration ever added
-- that value to this table's type CHECK constraint. The constraint most
-- recently widened by 20260824090000_add_structural_rejected_to_caller_audit_events.sql
-- only allowed 'caller.authenticated', 'caller.rejected',
-- 'caller.capability_denied', 'caller.principal_denied',
-- 'caller.non_human_denied', 'caller.structural_rejected'.
--
-- Effect in a real deployment (PARMANA_STORAGE backed by a live Postgres
-- audit sink, caller-auth enabled): every successful, authenticated
-- POST /execute or POST /transactions call fails closed with 503
-- AUDIT_UNAVAILABLE before ever reaching Policy Engine evaluation, since
-- the audit write itself is rejected by Postgres. Invisible in the
-- existing test suite because Supabase-backed integration tests are
-- opt-in (ALLOW_LIVE_SUPABASE=1); an in-memory audit sink has no such
-- constraint to violate.
--
-- Widens the constraint the same way each of its four prior widenings
-- did (20260812120000, 20260816120000, 20260818130000, 20260824090000).

ALTER TABLE caller_audit_events
DROP CONSTRAINT IF EXISTS caller_audit_events_type_check;

ALTER TABLE caller_audit_events
ADD CONSTRAINT caller_audit_events_type_check
CHECK (type IN (
    'caller.authenticated',
    'caller.rejected',
    'caller.capability_denied',
    'caller.principal_denied',
    'caller.non_human_denied',
    'caller.structural_rejected',
    'caller.capability_granted'
));
