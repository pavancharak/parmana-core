-- =============================================================================
-- Approval Artifact replay protection (TD-23 closure, Phase 3C)
-- =============================================================================
--
-- Backs SupabaseApprovalNonceStore's atomic checkAndRecord()
-- (packages/storage/src/supabase/SupabaseApprovalNonceStore.ts), the
-- durable NonceStore ApprovalVerifier uses to enforce that a Signed
-- Approval Artifact is consumed at most once.
--
-- Deliberately a separate table from consumed_nonces
-- (20260718090000_add_nonce_and_caller_audit_tables.sql), not a shared
-- one: an Approval Artifact's nonce and a Gateway Authorization
-- envelope's nonce are distinct trust domains issued by distinct
-- parties (an external business approver vs. Parmana's own runtime).
-- Sharing one table would let a coincidental nonce collision between
-- the two unrelated namespaces falsely report "already consumed" for
-- one because of the other.
--
-- Same shape, same atomicity mechanism, same reasoning as
-- consumed_nonces: append-only, the PRIMARY KEY on nonce IS the
-- atomic-consumption mechanism (two concurrent inserts of the same
-- nonce race at the database; exactly one succeeds, the other fails
-- with a 23505 unique_violation, mapped to "already consumed"). No
-- PII: a nonce is an opaque, single-use token chosen by the artifact's
-- issuer, not an identifier.

CREATE TABLE IF NOT EXISTS consumed_approval_nonces (

    nonce TEXT PRIMARY KEY,

    -- From the artifact's own expiresAt (NonceStore.checkAndRecord's
    -- second argument). Not currently read back by application code;
    -- kept for a future retention/cleanup job, mirroring
    -- consumed_nonces.expires_at's own residual note.
    expires_at TIMESTAMPTZ NOT NULL,

    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX IF NOT EXISTS idx_consumed_approval_nonces_expires_at
ON consumed_approval_nonces (
    expires_at
);

ALTER TABLE consumed_approval_nonces ENABLE ROW LEVEL SECURITY;
