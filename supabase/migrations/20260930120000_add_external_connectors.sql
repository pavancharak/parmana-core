-- =============================================================================
-- External connectors registered without a deploy (ADR-0013)
--
-- An external connector binds a capability to an HTTPS endpoint an
-- operator runs, and to the policy that governs it. Registering or
-- revoking one goes through maker checker, like approver keys: one
-- person proposes, a different person approves with a step up
-- signature, and only then does external_connectors change.
--
-- external_connector_changes holds each proposal and its resolution.
-- external_connectors holds the registrations; a row is revoked, never
-- deleted, so every release ever made to an endpoint stays explainable.
-- =============================================================================

CREATE TABLE IF NOT EXISTS external_connector_changes (

    change_id TEXT PRIMARY KEY,

    action TEXT NOT NULL CHECK (action IN ('register', 'revoke')),

    capability TEXT NOT NULL,

    endpoint_url TEXT,

    policy_name TEXT,

    allowed_parameters TEXT[],

    timeout_ms INTEGER,

    reason TEXT NOT NULL,

    proposed_by TEXT NOT NULL,

    proposed_at TIMESTAMPTZ NOT NULL,

    status TEXT NOT NULL CHECK (
        status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')
    ),

    resolved_by TEXT,

    resolved_at TIMESTAMPTZ,

    rejection_reason TEXT,

    -- A register carries the whole registration; a revoke carries none of it.
    CHECK (
        (action = 'register') = (endpoint_url IS NOT NULL)
        AND (action = 'register') = (policy_name IS NOT NULL)
        AND (action = 'register') = (allowed_parameters IS NOT NULL)
        AND (action = 'register') = (timeout_ms IS NOT NULL)
    ),

    CHECK (timeout_ms IS NULL OR timeout_ms BETWEEN 1000 AND 30000),

    -- Maker is not checker, enforced here as well as in the API.
    CHECK (resolved_by IS NULL OR resolved_by <> proposed_by)

);

-- One open change per capability at a time.
CREATE UNIQUE INDEX IF NOT EXISTS ux_external_connector_changes_open
ON external_connector_changes (
    capability
)
WHERE status = 'PENDING_APPROVAL';

CREATE INDEX IF NOT EXISTS idx_external_connector_changes_status
ON external_connector_changes (
    status
);

ALTER TABLE external_connector_changes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS external_connectors (

    -- The change_id of the approved register change that created it.
    registration_id TEXT PRIMARY KEY
        REFERENCES external_connector_changes(change_id)
        ON DELETE RESTRICT,

    capability TEXT NOT NULL,

    endpoint_url TEXT NOT NULL,

    policy_name TEXT NOT NULL,

    allowed_parameters TEXT[] NOT NULL,

    timeout_ms INTEGER NOT NULL CHECK (timeout_ms BETWEEN 1000 AND 30000),

    status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),

    registered_at TIMESTAMPTZ NOT NULL,

    revoked_by_change_id TEXT
        REFERENCES external_connector_changes(change_id)
        ON DELETE RESTRICT,

    revoked_at TIMESTAMPTZ,

    CHECK ((status = 'revoked') = (revoked_by_change_id IS NOT NULL))

);

-- One active registration per capability.
CREATE UNIQUE INDEX IF NOT EXISTS ux_external_connectors_active
ON external_connectors (
    capability
)
WHERE status = 'active';

ALTER TABLE external_connectors ENABLE ROW LEVEL SECURITY;
