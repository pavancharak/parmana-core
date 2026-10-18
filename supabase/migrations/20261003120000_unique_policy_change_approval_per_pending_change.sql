-- =============================================================================
-- One approval record per pending policy change
--
-- PolicyChangeApprovalService writes the signed approval record before
-- it writes the live policy file. Two approvals of the same pending
-- change at the same moment could both pass the route's
-- PENDING_APPROVAL check, then both sign a record and both write the
-- policy. With this index the second insert fails with a unique
-- violation, which the repository maps to a 409, so the second
-- approval stops before it touches the live policy. A retry by the same
-- approver after a partial failure reuses the existing record instead
-- of inserting another (PolicyChangeApprovalService).
--
-- The index covers records approved from 2026-10-03 18:18:37 UTC. Before
-- that, a retry after a partial failure signed a second record for the
-- same pending change, and production has one such pair (pending change
-- 662c9ade-b625-4953-8166-efcf6f630eb5, access-control 1.0.0, two
-- records by the same approver with the same content hash, the second
-- chained to the first through previous_record_hash). Those records are
-- signed evidence, so they are kept rather than deleted. Every record
-- approved after the cutoff is held to one per pending change.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uniq_policy_change_approval_records_pending_change
ON policy_change_approval_records (
    pending_policy_change_id
)
WHERE approved_at >= TIMESTAMPTZ '2026-10-03 18:18:37+00';
