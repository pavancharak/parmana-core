-- =============================================================================
-- Per-caller audit chain (regulatory-evidence gap: a deleted caller_audit_events
-- row was previously undetectable, unlike execution_trust_records' own
-- previousChainHash/chainHash chaining -- see docs/site/trust-and-claims/
-- objections-and-evidence.mdx, Domain 3's last row).
-- =============================================================================
--
-- Nullable and additive, matching every prior column addition to this table
-- (signature_json, 20260802130000; capability, 20260812120000; principal_id,
-- 20260816120000; business_transaction_id, 20260824090000). Existing rows are
-- unaffected and remain unchained -- honestly, the same way pre-signing rows
-- remain unsigned rather than being retroactively backfilled.
--
-- Chained per caller_id, not globally: caller_id is set on every event type
-- except the earliest possible rejection (malformed JSON/oversized body,
-- rejected before caller-auth middleware or any route handler runs) and
-- caller.rejected (no caller identified). Those rows get NULL chain fields --
-- there is no per-caller chain to link them into. A global chain was
-- considered and rejected: caller.authenticated fires on every authenticated
-- request to every route, the highest-write-volume table in this system: a
-- single global chain would require a lock serializing every request through
-- one write. Per-caller chaining (SupabaseCallerAuditSink.record(), a
-- Postgres advisory lock scoped to hashtext(caller_id)) only serializes a
-- caller against their own concurrent requests, not the whole API.
--
-- chain_hash/previous_chain_hash are not a separate signed artifact the way
-- execution_trust_records' chainHash/chainSignature are (ExecutionChainCrypto):
-- previous_chain_hash and chain_position are folded into the same object
-- AuditEventCrypto already signs into signature_json, so the existing
-- signature already covers the chain link -- no second signature column.

ALTER TABLE caller_audit_events
ADD COLUMN IF NOT EXISTS chain_hash TEXT;

ALTER TABLE caller_audit_events
ADD COLUMN IF NOT EXISTS previous_chain_hash TEXT;

ALTER TABLE caller_audit_events
ADD COLUMN IF NOT EXISTS chain_position BIGINT;

CREATE INDEX IF NOT EXISTS idx_caller_audit_events_caller_chain
ON caller_audit_events (
    caller_id,
    id DESC
)
WHERE caller_id IS NOT NULL;
