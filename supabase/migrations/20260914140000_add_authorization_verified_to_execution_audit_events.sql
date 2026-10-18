-- =============================================================================
-- Add 'authorization.verified' to execution_audit_events.type (GAP-3)
-- =============================================================================
--
-- parmana-paytm-agent's own audit writer (src/parmana/audit.ts in that
-- repository) records two events per POST /connector/paytm-refund request,
-- not one: 'authorization.verified' right after
-- verifyPaytmAuthorizationSignature succeeds, and 'execution.completed' or
-- 'execution.rejected' after the Paytm call resolves. Two rows, not one,
-- because a crash between those two points (verified, then never actually
-- executed) is exactly the failure mode an audit trail exists to catch --
-- collapsing them into a single row would silently lose that evidence.
--
-- Widened the same way caller_audit_events' own type CHECK constraint has
-- been widened repeatedly (20260812120000, 20260816120000, 20260818130000,
-- 20260824090000, 20260911090000): drop and recreate, adding the one new
-- value.

ALTER TABLE execution_audit_events
DROP CONSTRAINT IF EXISTS execution_audit_events_type_check;

ALTER TABLE execution_audit_events
ADD CONSTRAINT execution_audit_events_type_check
CHECK (type IN (
    'session.created',
    'execution.completed',
    'execution.rejected',
    'authorization.verified'
));
