-- =============================================================================
-- Policy Governance (maker-checker)
--
-- Prior to this migration, Parmana explicitly excluded policy
-- authoring/change-approval from its scope (GOVERNANCE.md,
-- SECURITY.md, TRUST_MODEL.md all named "policy authoring" /
-- "business policy authoring" as outside the Trust Model). These two
-- tables are the durable state behind the new scope: a policy
-- content change must be proposed by one human and approved or
-- rejected by a distinct human before it takes effect.
--
-- pending_policy_changes holds the maker's proposal and its
-- eventual resolution. policy_change_approval_records holds the
-- signed, permanent, append-only evidence created exactly once, at
-- approval time -- G-24's content-hash remediation: contentHashBefore
-- /contentHashAfter prove exactly what content an approval covered,
-- not merely which version string, so an in-place edit to an
-- existing version's file (VERIFICATION-GAPS.md G-24's own precedent
-- for that pattern) remains detectable even though it's allowed.
-- =============================================================================

CREATE TABLE IF NOT EXISTS pending_policy_changes (

    pending_policy_change_id TEXT PRIMARY KEY,

    policy_name TEXT NOT NULL,

    policy_version TEXT NOT NULL,

    proposed_content_json JSONB NOT NULL,

    proposed_by TEXT NOT NULL,

    proposed_at TIMESTAMPTZ NOT NULL,

    status TEXT NOT NULL CHECK (
        status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')
    ),

    reason TEXT NOT NULL,

    resolved_by TEXT,

    resolved_at TIMESTAMPTZ,

    rejection_reason TEXT

);

-- Database-level enforcement of "exactly one PENDING_APPROVAL change
-- per (policyName, policyVersion) at a time" -- a partial unique
-- index, not a plain UNIQUE constraint, since APPROVED/REJECTED
-- history for the same (name, version) pair must be allowed to
-- accumulate. Mirrors business_transactions' PRIMARY KEY making G-1's
-- duplicate-insert race atomic at the database rather than only in
-- application code.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pending_policy_changes_open
ON pending_policy_changes (
    policy_name,
    policy_version
)
WHERE status = 'PENDING_APPROVAL';

CREATE INDEX IF NOT EXISTS idx_pending_policy_changes_status
ON pending_policy_changes (
    status
);

ALTER TABLE pending_policy_changes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS policy_change_approval_records (

    policy_change_approval_record_id TEXT PRIMARY KEY,

    pending_policy_change_id TEXT NOT NULL
        REFERENCES pending_policy_changes(pending_policy_change_id)
        ON DELETE RESTRICT,

    policy_name TEXT NOT NULL,

    policy_version TEXT NOT NULL,

    proposed_by TEXT NOT NULL,

    approved_by TEXT NOT NULL,

    proposed_at TIMESTAMPTZ NOT NULL,

    approved_at TIMESTAMPTZ NOT NULL,

    content_hash_before TEXT,

    content_hash_after TEXT NOT NULL,

    signature_json JSONB NOT NULL

);

-- Startup/deploy integrity check (see PolicyIntegrityChecker) reads
-- "the most recent approval record for a given (policy_name,
-- policy_version)" -- this index makes that lookup a single index
-- scan rather than a full table scan as approval history grows.
CREATE INDEX IF NOT EXISTS idx_policy_change_approval_records_policy
ON policy_change_approval_records (
    policy_name,
    policy_version,
    approved_at DESC
);

ALTER TABLE policy_change_approval_records ENABLE ROW LEVEL SECURITY;
