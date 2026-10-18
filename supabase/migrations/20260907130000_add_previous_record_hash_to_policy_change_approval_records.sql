-- =============================================================================
-- Policy Change Approval Record chaining
--
-- Adds previous_record_hash: the sha256 (via the same
-- PolicyChangeCrypto.hashPolicyContent every other hash in this table
-- uses) of the approval record that immediately preceded this one for
-- the same (policy_name, policy_version), computed and embedded in
-- this record's own signed payload at approval time
-- (PolicyChangeApprovalService). Absent only for the first approval
-- ever recorded for a given (policy_name, policy_version) pair.
--
-- content_hash_after (existing) proves the live policy.json matches
-- what the most recent approval covered. This column additionally
-- proves the approval-record history itself has not been edited,
-- reordered, or had a record deleted -- a bypass of the audit trail
-- distinct from a bypass of the live file. Same naming convention as
-- caller_audit_events' own chain_hash/previous_chain_hash
-- (20260906120000_add_per_caller_chain_to_caller_audit_events.sql).
-- =============================================================================

ALTER TABLE policy_change_approval_records
ADD COLUMN IF NOT EXISTS previous_record_hash TEXT;
