-- =============================================================================
-- Business signal sources registered without a deploy (RFC-0023 phase 2)
--
-- A business signal source is a business system that answers the facts a
-- policy's signalSources declares, such as an order system answering
-- whether a refund is eligible. Registering or revoking one goes through
-- maker checker, like external connectors: one person proposes, a
-- different person approves with a step up signature, and only then does
-- business_signal_sources change.
--
-- When a source registers an Ed25519 public key, every answer it gives
-- must be signed with it, and Parmana verifies the signature.
--
-- business_signal_source_changes holds each proposal and its resolution.
-- business_signal_sources holds the registrations; a row is revoked,
-- never deleted, so every Trusted Signal ever recorded stays explainable.
-- =============================================================================

CREATE TABLE IF NOT EXISTS business_signal_source_changes (

    change_id TEXT PRIMARY KEY,

    action TEXT NOT NULL CHECK (action IN ('register', 'revoke')),

    name TEXT NOT NULL CHECK (name ~ '^[a-z0-9][a-z0-9-]{0,62}$'),

    endpoint_url TEXT,

    timeout_ms INTEGER,

    public_key_pem TEXT,

    key_id TEXT,

    reason TEXT NOT NULL,

    proposed_by TEXT NOT NULL,

    proposed_at TIMESTAMPTZ NOT NULL,

    status TEXT NOT NULL CHECK (
        status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')
    ),

    resolved_by TEXT,

    resolved_at TIMESTAMPTZ,

    rejection_reason TEXT,

    -- A register carries an endpoint and timeout; a revoke carries none of
    -- the registration.
    CHECK (
        (action = 'register') = (endpoint_url IS NOT NULL)
        AND (action = 'register') = (timeout_ms IS NOT NULL)
        AND (action = 'register' OR public_key_pem IS NULL)
        AND (action = 'register' OR key_id IS NULL)
    ),

    -- A key id labels a key; there is none without one.
    CHECK (key_id IS NULL OR public_key_pem IS NOT NULL),

    CHECK (timeout_ms IS NULL OR timeout_ms BETWEEN 1000 AND 30000),

    -- Maker is not checker, enforced here as well as in the API.
    CHECK (resolved_by IS NULL OR resolved_by <> proposed_by)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_business_signal_source_changes_open
ON business_signal_source_changes (
    name
)
WHERE status = 'PENDING_APPROVAL';

CREATE INDEX IF NOT EXISTS idx_business_signal_source_changes_status
ON business_signal_source_changes (
    status
);

ALTER TABLE business_signal_source_changes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS business_signal_sources (

    -- The change_id of the approved register change that created it.
    registration_id TEXT PRIMARY KEY
        REFERENCES business_signal_source_changes(change_id)
        ON DELETE RESTRICT,

    name TEXT NOT NULL,

    endpoint_url TEXT NOT NULL,

    timeout_ms INTEGER NOT NULL CHECK (timeout_ms BETWEEN 1000 AND 30000),

    public_key_pem TEXT,

    key_id TEXT,

    status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),

    registered_at TIMESTAMPTZ NOT NULL,

    revoked_by_change_id TEXT
        REFERENCES business_signal_source_changes(change_id)
        ON DELETE RESTRICT,

    revoked_at TIMESTAMPTZ,

    CHECK ((status = 'revoked') = (revoked_by_change_id IS NOT NULL)),

    CHECK (key_id IS NULL OR public_key_pem IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_business_signal_sources_active
ON business_signal_sources (
    name
)
WHERE status = 'active';

ALTER TABLE business_signal_sources ENABLE ROW LEVEL SECURITY;
