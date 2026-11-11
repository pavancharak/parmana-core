-- =============================================================================
-- Approver grants (G-50).
--
-- An approval is accepted only when its approver is granted the capability
-- it approves. Grants are stored with the key: a maker proposes an add with
-- the capabilities the key may approve, and a different checker approves it.
-- The grants are then copied onto approval_issuers when the add is approved.
--
-- A key added before this migration has no grants (the empty default), so it
-- can approve nothing until it is revoked and re-added with grants. That is
-- the fail-closed starting state.
-- =============================================================================

ALTER TABLE approval_issuer_changes
    ADD COLUMN IF NOT EXISTS capabilities TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE approval_issuers
    ADD COLUMN IF NOT EXISTS capabilities TEXT[] NOT NULL DEFAULT '{}';
