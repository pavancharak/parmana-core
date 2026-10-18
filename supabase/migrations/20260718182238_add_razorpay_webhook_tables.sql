-- =============================================================================
-- Razorpay webhook event dedupe and audit trail (M4a)
-- =============================================================================
--
-- Backs the durable, Supabase-backed webhook infrastructure introduced this
-- session (packages/api/src/webhooks/SupabaseRazorpayWebhookEventStore.ts,
-- SupabaseRazorpayWebhookAuditSink.ts). See docs/CLAIMS.md for the scope of
-- what this closes: signature-verified, deduplicated event receipt only.
-- Nothing in this session reads razorpay_webhook_events back to act on a
-- settlement/refund lifecycle change — that is M4b.

-- -----------------------------------------------------------------------------
-- razorpay_webhook_events
-- -----------------------------------------------------------------------------
--
-- Append-only. The primary key on event_id IS the atomic-consumption
-- mechanism, exactly like consumed_nonces's primary key on nonce (see
-- 20260718090000_add_nonce_and_caller_audit_tables.sql): two concurrent
-- inserts of the same event id race at the database, and exactly one
-- succeeds — the other fails with a 23505 unique_violation, which
-- SupabaseRazorpayWebhookEventStore maps to "already consumed" (returns
-- false) rather than a thrown failure. A row here only ever exists for a
-- request whose HMAC signature has already been verified — see
-- routes/webhooks-razorpay.ts's verify-then-consume ordering.
--
-- payload is the raw JSON body, stored verbatim for M4b to parse in full;
-- this table's own indexed columns (event_id, event_type) exist purely for
-- lookup/routing, not as a substitute for re-parsing the payload.

CREATE TABLE IF NOT EXISTS razorpay_webhook_events (

    event_id TEXT PRIMARY KEY,

    -- The verified payload's top-level `event` field (e.g.
    -- "refund.processed"), when present and a string. Not authoritative on
    -- its own — M4b re-parses `payload` in full.
    event_type TEXT,

    payload TEXT NOT NULL,

    received_at TIMESTAMPTZ NOT NULL,

    inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX IF NOT EXISTS idx_razorpay_webhook_events_received_at
ON razorpay_webhook_events (
    received_at
);

CREATE INDEX IF NOT EXISTS idx_razorpay_webhook_events_event_type
ON razorpay_webhook_events (
    event_type
);

ALTER TABLE razorpay_webhook_events ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- razorpay_webhook_audit_events
-- -----------------------------------------------------------------------------
--
-- Append-only. Mirrors packages/api/src/webhooks/RazorpayWebhookAuditSink.ts's
-- RazorpayWebhookAuditEvent shape exactly. Deliberately narrow, matching this
-- session's payload-handling rule (treat the body as untrusted input even
-- post-verification): event_id, event_type, payment_id, and refund_id are the
-- only payload-derived fields ever written here — no full payload contents,
-- no card/customer fields Razorpay's payload may include. reason is one of a
-- fixed set of short diagnostic strings ("missing signature header",
-- "invalid signature", "missing event id header") — no signature or secret
-- material.

CREATE TABLE IF NOT EXISTS razorpay_webhook_audit_events (

    id BIGSERIAL PRIMARY KEY,

    type TEXT NOT NULL
        CHECK (type IN ('webhook.received', 'webhook.duplicate', 'webhook.rejected')),

    occurred_at TIMESTAMPTZ NOT NULL,

    route TEXT NOT NULL,

    -- Present once the signature has verified (received, duplicate, or a
    -- post-verification rejection such as a missing event id header).
    event_id TEXT,

    event_type TEXT,
    payment_id TEXT,
    refund_id TEXT,

    -- Present only for type = 'webhook.rejected'.
    reason TEXT,

    inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX IF NOT EXISTS idx_razorpay_webhook_audit_events_occurred_at
ON razorpay_webhook_audit_events (
    occurred_at
);

CREATE INDEX IF NOT EXISTS idx_razorpay_webhook_audit_events_event_id
ON razorpay_webhook_audit_events (
    event_id
);

ALTER TABLE razorpay_webhook_audit_events ENABLE ROW LEVEL SECURITY;
