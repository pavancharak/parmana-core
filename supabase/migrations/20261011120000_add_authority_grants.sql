-- =============================================================================
-- Authority grants (RFC-0023 phase 3)
--
-- An authority grant says one caller (an agent's API key, by callerId) may
-- have requests for one capability decided, within limits on the request,
-- from valid_from until valid_until. A policy with requireAuthorityGrant
-- decides a request only when its caller holds such a grant: none or a
-- revoked one is NOT_AUTHORIZED, an expired one AUTHORITY_EXPIRED.
--
-- Making or revoking a grant goes through maker checker, like external
-- connectors and business signal sources: one person proposes, a different
-- person approves with a step up signature, and only then does
-- authority_grants change. Neither may be the caller the grant is for.
--
-- authority_grant_changes holds each proposal and its resolution.
-- authority_grants holds the grants; a row is revoked, never deleted, so
-- every decision that rested on a grant stays explainable.
-- =============================================================================

CREATE TABLE IF NOT EXISTS authority_grant_changes (

    change_id TEXT PRIMARY KEY,

    action TEXT NOT NULL CHECK (action IN ('grant', 'revoke')),

    caller_id TEXT NOT NULL CHECK (char_length(caller_id) BETWEEN 1 AND 256),

    capability TEXT NOT NULL CHECK (
        capability ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*:[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    ),

    -- By Intent path ("target", "parameters.<name>"): { min, max, oneOf }.
    limits JSONB,

    valid_from TIMESTAMPTZ,

    valid_until TIMESTAMPTZ,

    reason TEXT NOT NULL,

    proposed_by TEXT NOT NULL,

    proposed_at TIMESTAMPTZ NOT NULL,

    status TEXT NOT NULL CHECK (
        status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')
    ),

    resolved_by TEXT,

    resolved_at TIMESTAMPTZ,

    rejection_reason TEXT,

    -- A grant carries an expiry; a revoke carries none of the grant.
    CHECK (
        (action = 'grant') = (valid_until IS NOT NULL)
        AND (action = 'grant' OR (limits IS NULL AND valid_from IS NULL))
    ),

    CHECK (valid_from IS NULL OR valid_until > valid_from),

    CHECK (limits IS NULL OR jsonb_typeof(limits) = 'object'),

    -- No one grants authority to themselves.
    CHECK (caller_id <> proposed_by),

    -- Maker is not checker, and the checker is not the grantee either,
    -- enforced here as well as in the API.
    CHECK (resolved_by IS NULL OR (resolved_by <> proposed_by AND resolved_by <> caller_id))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_authority_grant_changes_open
ON authority_grant_changes (
    caller_id,
    capability
)
WHERE status = 'PENDING_APPROVAL';

CREATE INDEX IF NOT EXISTS idx_authority_grant_changes_status
ON authority_grant_changes (
    status
);

ALTER TABLE authority_grant_changes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS authority_grants (

    -- The change_id of the approved grant change that created it.
    grant_id TEXT PRIMARY KEY
        REFERENCES authority_grant_changes(change_id)
        ON DELETE RESTRICT,

    caller_id TEXT NOT NULL,

    capability TEXT NOT NULL,

    limits JSONB,

    valid_from TIMESTAMPTZ NOT NULL,

    valid_until TIMESTAMPTZ NOT NULL,

    status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),

    granted_at TIMESTAMPTZ NOT NULL,

    revoked_by_change_id TEXT
        REFERENCES authority_grant_changes(change_id)
        ON DELETE RESTRICT,

    revoked_at TIMESTAMPTZ,

    CHECK ((status = 'revoked') = (revoked_by_change_id IS NOT NULL)),

    CHECK (valid_until > valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_authority_grants_active
ON authority_grants (
    caller_id,
    capability
)
WHERE status = 'active';

ALTER TABLE authority_grants ENABLE ROW LEVEL SECURITY;
