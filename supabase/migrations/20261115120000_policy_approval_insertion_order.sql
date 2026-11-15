-- =============================================================================
-- Policy approval records: insertion order breaks a tie on approved_at
-- =============================================================================
--
-- approved_at is set from the application clock with millisecond precision.
-- Approvals of different pending changes are not serialized, so two approvals
-- for the same policy name can share a millisecond. Until now the tie was
-- broken by the random record id (and findMostRecentFor had no tie-break at
-- all), so which version was in effect could be arbitrary.
--
-- approval_sequence gives every new record an insertion order. The queries
-- rank by approved_at, then approval_sequence, then the record id.
--
-- No existing row is changed. The table is append-only (20261110120000), so a
-- backfill would need the append-only trigger disabled, which this migration
-- does not do. Existing rows keep NULL. NULLS LAST ranks them below a new
-- record with the same approved_at. Ties among existing rows are still decided
-- by the record id, as before.
--
-- Safe to re-run: ADD COLUMN, CREATE SEQUENCE and CREATE INDEX use IF NOT
-- EXISTS, and SET DEFAULT replaces the default with the same one.

ALTER TABLE policy_change_approval_records
    ADD COLUMN IF NOT EXISTS approval_sequence BIGINT;

CREATE SEQUENCE IF NOT EXISTS policy_change_approval_records_approval_sequence_seq
    AS BIGINT;

ALTER TABLE policy_change_approval_records
    ALTER COLUMN approval_sequence
    SET DEFAULT nextval('policy_change_approval_records_approval_sequence_seq');

-- The queries that decide "most recent" for a name, with the same ordering
-- as the repository's MOST_RECENT_FIRST.
CREATE INDEX IF NOT EXISTS idx_policy_change_approval_records_name_recency
ON policy_change_approval_records (
    policy_name,
    approved_at DESC,
    approval_sequence DESC NULLS LAST,
    policy_change_approval_record_id DESC
);
