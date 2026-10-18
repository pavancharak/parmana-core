-- =============================================================================
-- Durable replay protection and caller-audit trail (G-13)
-- =============================================================================
--
-- Closes G-13 (docs/VERIFICATION-GAPS.md): the production-default NonceStore
-- and CallerAuditSink were in-memory and reset on process restart. These two
-- tables back their durable, Supabase-backed replacements
-- (packages/storage/src/supabase/SupabaseNonceStore.ts,
-- packages/api/src/auth/SupabaseCallerAuditSink.ts).

-- -----------------------------------------------------------------------------
-- consumed_nonces
-- -----------------------------------------------------------------------------
--
-- Append-only. Application code never updates or deletes a row. The primary
-- key on nonce IS the atomic-consumption mechanism: two concurrent inserts of
-- the same nonce race at the database, and exactly one succeeds — the other
-- fails with a 23505 unique_violation, which SupabaseNonceStore maps to
-- "already consumed" (see packages/storage/src/errors/PostgresErrorCodes.ts).
-- No PII: a nonce is an opaque random token, not an identifier.

CREATE TABLE IF NOT EXISTS consumed_nonces (

    nonce TEXT PRIMARY KEY,

    -- From the envelope's own expiresAt (NonceStore.checkAndRecord's second
    -- argument) — the only extra field the existing NonceStore interface
    -- already carries. Not currently read back by application code; kept for
    -- a future retention/cleanup job (see VERIFICATION-GAPS.md G-13 residual
    -- note) to bound table growth by purging rows whose expiry has long
    -- since passed.
    expires_at TIMESTAMPTZ NOT NULL,

    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX IF NOT EXISTS idx_consumed_nonces_expires_at
ON consumed_nonces (
    expires_at
);

ALTER TABLE consumed_nonces ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- caller_audit_events
-- -----------------------------------------------------------------------------
--
-- Append-only. Mirrors packages/api/src/auth/CallerAuditSink.ts's
-- CallerAuditEvent shape exactly. caller_id is a configured identifier
-- (ApiKeyEntry.callerId), never the raw credential; reason is one of a fixed
-- set of short diagnostic strings ("invalid credential", "missing
-- credential") — no PII, no secret material.

CREATE TABLE IF NOT EXISTS caller_audit_events (

    id BIGSERIAL PRIMARY KEY,

    type TEXT NOT NULL
        CHECK (type IN ('caller.authenticated', 'caller.rejected')),

    occurred_at TIMESTAMPTZ NOT NULL,

    route TEXT NOT NULL,

    -- Present only for type = 'caller.authenticated'.
    caller_id TEXT,

    -- Present only for type = 'caller.rejected'. Never the credential itself.
    reason TEXT,

    inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX IF NOT EXISTS idx_caller_audit_events_occurred_at
ON caller_audit_events (
    occurred_at
);

CREATE INDEX IF NOT EXISTS idx_caller_audit_events_caller_id
ON caller_audit_events (
    caller_id
);

ALTER TABLE caller_audit_events ENABLE ROW LEVEL SECURITY;
