-- =============================================================================
-- Policy Change Step-Up Authorization replay protection (Policy
-- Governance, maker-checker, Layer 4)
-- =============================================================================
--
-- Backs SupabasePolicyChangeStepUpNonceStore's atomic checkAndRecord()
-- (packages/storage/src/supabase/SupabasePolicyChangeStepUpNonceStore.ts),
-- the durable NonceStore PolicyChangeStepUpVerifier uses to enforce
-- that a signed step-up envelope on POST /policies/pending-changes/:id/
-- approve or .../reject is consumed at most once.
--
-- Deliberately a separate table from both consumed_nonces
-- (20260718090000, ExecutionGateway's own Authorization-envelope
-- replay protection) and consumed_approval_nonces (20260805180000,
-- Approval Artifact replay protection): a step-up envelope's nonce is
-- issued by yet another distinct trust domain -- an individual human
-- checker's own key, provisioned once via generate-api-key.ts's
-- --generate-step-up-key flag -- and sharing a table with either of
-- the other two would let a coincidental nonce collision between
-- unrelated namespaces falsely report "already consumed," and would
-- couple three independent replay-protection concerns' retention/
-- cleanup lifecycles together for no benefit.
--
-- Same shape, same atomicity mechanism, same reasoning as
-- consumed_nonces/consumed_approval_nonces: append-only, the PRIMARY
-- KEY on nonce IS the atomic-consumption mechanism (two concurrent
-- inserts of the same nonce race at the database; exactly one
-- succeeds, the other fails with a 23505 unique_violation, mapped to
-- "already consumed"). No PII: a nonce is an opaque, single-use token
-- chosen by the envelope's signer, not an identifier.

CREATE TABLE IF NOT EXISTS consumed_policy_change_step_up_nonces (

    nonce TEXT PRIMARY KEY,

    -- From the envelope's own expiresAt (NonceStore.checkAndRecord's
    -- second argument). Not currently read back by application code;
    -- kept for a future retention/cleanup job, mirroring
    -- consumed_nonces.expires_at's own residual note.
    expires_at TIMESTAMPTZ NOT NULL,

    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX IF NOT EXISTS idx_consumed_policy_change_step_up_nonces_expires_at
ON consumed_policy_change_step_up_nonces (
    expires_at
);

ALTER TABLE consumed_policy_change_step_up_nonces ENABLE ROW LEVEL SECURITY;
