-- =============================================================================
-- Approvers managed without a deploy
--
-- An approver key trusted to sign Approval Artifacts used to exist only
-- in createApprovalIssuerRegistry.ts, so adding or revoking one needed a
-- pull request and a deploy. These two tables let people do it through
-- maker checker instead: one person proposes adding or revoking a key,
-- a different person approves it with a step up signature, and only
-- then does approval_issuers change. The list in code is still checked
-- first.
--
-- approval_issuer_changes holds each proposal and its resolution.
-- approval_issuers holds the keys added that way; a row is revoked,
-- never deleted, so every approval ever verified against it stays
-- explainable.
-- =============================================================================

CREATE TABLE IF NOT EXISTS approval_issuer_changes (

    change_id TEXT PRIMARY KEY,

    action TEXT NOT NULL CHECK (action IN ('add', 'revoke')),

    approver_id TEXT NOT NULL,

    key_id TEXT NOT NULL,

    public_key_pem TEXT,

    reason TEXT NOT NULL,

    proposed_by TEXT NOT NULL,

    proposed_at TIMESTAMPTZ NOT NULL,

    status TEXT NOT NULL CHECK (
        status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')
    ),

    resolved_by TEXT,

    resolved_at TIMESTAMPTZ,

    rejection_reason TEXT,

    -- An add carries the key; a revoke does not.
    CHECK ((action = 'add') = (public_key_pem IS NOT NULL)),

    -- Maker is not checker, enforced here as well as in the API.
    CHECK (resolved_by IS NULL OR resolved_by <> proposed_by)

);

-- One open change per approver and key at a time.
CREATE UNIQUE INDEX IF NOT EXISTS ux_approval_issuer_changes_open
ON approval_issuer_changes (
    approver_id,
    key_id
)
WHERE status = 'PENDING_APPROVAL';

CREATE INDEX IF NOT EXISTS idx_approval_issuer_changes_status
ON approval_issuer_changes (
    status
);

ALTER TABLE approval_issuer_changes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS approval_issuers (

    approver_id TEXT NOT NULL,

    key_id TEXT NOT NULL,

    public_key_pem TEXT NOT NULL,

    revoked BOOLEAN NOT NULL DEFAULT FALSE,

    added_by_change_id TEXT NOT NULL
        REFERENCES approval_issuer_changes(change_id)
        ON DELETE RESTRICT,

    added_at TIMESTAMPTZ NOT NULL,

    revoked_by_change_id TEXT
        REFERENCES approval_issuer_changes(change_id)
        ON DELETE RESTRICT,

    revoked_at TIMESTAMPTZ,

    PRIMARY KEY (approver_id, key_id),

    CHECK (revoked = (revoked_by_change_id IS NOT NULL))

);

ALTER TABLE approval_issuers ENABLE ROW LEVEL SECURITY;
