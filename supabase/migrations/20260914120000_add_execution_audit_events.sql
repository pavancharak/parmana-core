-- =============================================================================
-- Durable execution-audit trail (GAP-1, GAPS.md 2026-09-14)
-- =============================================================================
--
-- Closes GAP-1: execution.rejected/execution.completed/session.created events
-- (packages/execution-control/src/ExecutionControlService.ts) were previously
-- recorded to MemoryExecutionAuditSink only -- lost on process restart, not
-- queryable outside the running process. This table backs its durable,
-- Supabase-backed replacement (packages/storage/src/supabase/
-- SupabaseExecutionAuditSink.ts). MemoryExecutionAuditSink remains correct for
-- tests -- see packages/api/src/bootstrap/createExecutionAuditSink.ts.
--
-- Mirrors caller_audit_events (supabase/migrations/20260718090000_add_nonce_
-- and_caller_audit_tables.sql) in shape and discipline: append-only, signed at
-- write time, chained so a deleted or altered row is detectable. Chained per
-- authorizationId rather than per caller -- one authorization's full
-- execution lifecycle (session.created -> execution.completed or
-- execution.rejected) is exactly the unit a regulator asks about ("show me
-- everything that happened for this refund's authorization"), and unlike
-- caller_audit_events this table has no per-caller identity to chain against
-- at all (an authorizationId is not a caller).

CREATE TABLE IF NOT EXISTS execution_audit_events (

    id BIGSERIAL PRIMARY KEY,

    type TEXT NOT NULL
        CHECK (type IN ('session.created', 'execution.completed', 'execution.rejected')),

    occurred_at TIMESTAMPTZ NOT NULL,

    connector_id TEXT NOT NULL,

    authorization_id TEXT NOT NULL,

    session_id TEXT NOT NULL,

    -- The ExecutableContent.action this event concerns (the capability
    -- released or rejected, e.g. "paytm:refund"). Present on every event
    -- ExecutionControlService.execute() records; nullable here only to
    -- match ExecutionAuditEvent.action's own optional typing.
    action TEXT,

    -- Present only on type = 'execution.rejected'. Never the credential
    -- itself -- the connector's own thrown Error message.
    reason TEXT,

    -- Metadata only, per ExecutionAuditEvent's own doc comment -- never a
    -- credential's secret value.
    credential_id TEXT,
    gateway_id TEXT,

    signature_json JSONB NOT NULL,

    -- Chain per authorizationId: previous_chain_hash is that
    -- authorization's own immediately-preceding event's chain_hash (NULL
    -- for its first event), chain_position a 1-based per-authorization
    -- sequence number. Every event carries an authorizationId (unlike
    -- caller_audit_events, where some events have no callerId at all), so
    -- these two columns are NOT NULL here.
    chain_hash TEXT NOT NULL,
    previous_chain_hash TEXT,
    chain_position INTEGER NOT NULL,

    inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX IF NOT EXISTS idx_execution_audit_events_occurred_at
ON execution_audit_events (
    occurred_at
);

CREATE INDEX IF NOT EXISTS idx_execution_audit_events_authorization_id
ON execution_audit_events (
    authorization_id
);

CREATE INDEX IF NOT EXISTS idx_execution_audit_events_connector_id
ON execution_audit_events (
    connector_id
);

ALTER TABLE execution_audit_events ENABLE ROW LEVEL SECURITY;
