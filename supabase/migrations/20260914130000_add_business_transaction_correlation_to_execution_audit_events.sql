-- =============================================================================
-- Cross-service correlation and external writers for execution_audit_events
-- (GAP-3, GAPS.md 2026-09-14)
-- =============================================================================
--
-- execution_audit_events (20260914120000_add_execution_audit_events.sql) chains
-- events by authorization_id -- Parmana's own internal authorization identity.
-- That identity is never forwarded across the trust boundary to a remote
-- connector service (see GatewayPaytmAdapter's own wire contract,
-- packages/execution-gateway/src/connector-execution/GatewayPaytmAdapter.ts):
-- parmana-paytm-agent only ever sees businessTransactionId, orderId, txnId,
-- and its own re-signed authorization envelope. Without a shared correlation
-- key, a regulator asking "show me everything that happened for this refund"
-- could see only Parmana's own half of the story.
--
-- Two changes:
--
-- 1. business_transaction_id (nullable): populated by
--    ExecutionControlService (release.executableContent.businessTransactionId)
--    on every event it writes, and by parmana-paytm-agent's own audit writer
--    (its only available correlation id) on every event *it* writes. Querying
--    by this column, not authorization_id, retrieves one refund's complete
--    cross-service story.
--
-- 2. signature_json/chain_hash/chain_position relaxed to nullable: these were
--    NOT NULL because SupabaseExecutionAuditSink (this repo) always signs and
--    chains. parmana-paytm-agent has no Parmana private key -- it only ever
--    holds Parmana's *public* key, to verify, never to sign -- and no
--    Ed25519 keypair of its own, so it cannot produce either field. Its rows
--    are therefore durable but unsigned/unchained: this is an acceptable,
--    deliberate trust-boundary asymmetry (a compromised parmana-paytm-agent
--    could already forge Paytm calls it holds real credentials for; a real
--    Parmana-signed authorization is still required upstream of it, and that
--    signature is verified and durably recorded by SupabaseExecutionAuditSink
--    on Parmana's own side regardless of what this service logs about
--    itself).

ALTER TABLE execution_audit_events
ADD COLUMN IF NOT EXISTS business_transaction_id TEXT;

CREATE INDEX IF NOT EXISTS idx_execution_audit_events_business_transaction_id
ON execution_audit_events (
    business_transaction_id
);

ALTER TABLE execution_audit_events
ALTER COLUMN signature_json DROP NOT NULL;

ALTER TABLE execution_audit_events
ALTER COLUMN chain_hash DROP NOT NULL;

ALTER TABLE execution_audit_events
ALTER COLUMN chain_position DROP NOT NULL;
