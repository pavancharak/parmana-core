-- =============================================================================
-- Parmana: consolidated migration script
-- =============================================================================
--
-- Concatenates every file in supabase/migrations/ (filename order, which is
-- also chronological order), unmodified, for one-shot application via the
-- Supabase Dashboard's SQL Editor. See docs/site/deployment/production.mdx, step 2,
-- for when and why this is needed.
--
-- Safe to run once against an empty project. NOT safe to run again against a
-- project that already holds data (G-61, docs/VERIFICATION-GAPS.md, found on
-- 2026-09-25): several migrations drop and add back the same CHECK constraint
-- with a longer list of allowed values each time, so a second run adds back an
-- older, narrower constraint over rows written under a newer one, and fails
-- (caller_audit_events_type_check was the first). Apply only the migrations
-- a project does not have yet: `npm run db:migrate -- apply` does that for
-- any Postgres, and the self hosted deployment's docker/local/migrate.sh does
-- it on every start. Both record each file in parmana_schema_migrations. A
-- project set up with this file is baselined once first:
-- `npm run db:migrate -- baseline --through <newest migration it has>`.
--
-- Statements are otherwise written to tolerate being applied again:
--   - CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
--   - ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--   - ALTER TABLE ... ENABLE ROW LEVEL SECURITY (a Postgres no-op if RLS is
--     already enabled -- it does not error on re-application)
--   - ALTER TABLE ... DROP CONSTRAINT IF EXISTS immediately followed by an
--     unconditional ADD CONSTRAINT, which is the exception described above
-- Column definitions, primary keys, RLS enablement, and constraints are
-- preserved exactly from source -- nothing here was "improved."


-- =============================================================================
-- Source: supabase/migrations/20260629013035_initial_schema.sql
-- =============================================================================
-- Parmana Initial Schema
-- =============================================================================

CREATE TABLE IF NOT EXISTS business_transactions (

    business_transaction_id TEXT PRIMARY KEY,

    status TEXT NOT NULL,

    authority_json JSONB NOT NULL,

    authorization_json JSONB NOT NULL,

    intent_json JSONB NOT NULL,

    metadata_json JSONB NOT NULL,

    policy_json JSONB NOT NULL,

    signals_json JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL

);

CREATE TABLE IF NOT EXISTS execution_trust_records (

    trust_record_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL UNIQUE,

    transaction_json JSONB NOT NULL,

    trust_record_hash TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL,

    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_transaction
        FOREIGN KEY (
            business_transaction_id
        )
        REFERENCES business_transactions(
            business_transaction_id
        )
        ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS executions (

    execution_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL,

    execution_json JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_execution_transaction
        FOREIGN KEY (
            business_transaction_id
        )
        REFERENCES business_transactions(
            business_transaction_id
        )
        ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS overrides (

    override_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL,

    override_json JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_override_transaction
        FOREIGN KEY (
            business_transaction_id
        )
        REFERENCES business_transactions(
            business_transaction_id
        )
        ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS verifications (

    verification_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL,

    verification_json JSONB NOT NULL,

    verified_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_verification_transaction
        FOREIGN KEY (
            business_transaction_id
        )
        REFERENCES business_transactions(
            business_transaction_id
        )
        ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS receipts (

    receipt_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL,

    receipt_json JSONB NOT NULL,

    issued_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_receipt_transaction
        FOREIGN KEY (
            business_transaction_id
        )
        REFERENCES business_transactions(
            business_transaction_id
        )
        ON DELETE RESTRICT

);

CREATE INDEX IF NOT EXISTS idx_business_transactions_created_at
ON business_transactions (
    created_at
);

CREATE INDEX IF NOT EXISTS idx_execution_trust_records_transaction
ON execution_trust_records (
    business_transaction_id
);

CREATE INDEX IF NOT EXISTS idx_execution_transaction
ON executions (
    business_transaction_id
);

CREATE INDEX IF NOT EXISTS idx_executions_created_at
ON executions (
    created_at
);

CREATE INDEX IF NOT EXISTS idx_override_transaction
ON overrides (
    business_transaction_id
);

CREATE INDEX IF NOT EXISTS idx_verification_transaction
ON verifications (
    business_transaction_id
);

CREATE INDEX IF NOT EXISTS idx_verifications_verified_at
ON verifications (
    verified_at
);

CREATE INDEX IF NOT EXISTS idx_receipt_transaction
ON receipts (
    business_transaction_id
);

CREATE INDEX IF NOT EXISTS idx_receipts_issued_at
ON receipts (
    issued_at
);


-- =============================================================================
-- Source: supabase/migrations/20260702183000_add_signature_to_execution_trust_records.sql
-- =============================================================================
-- RFC-0020
-- Persist Trust Record Signature
-- =============================================================================

ALTER TABLE execution_trust_records
ADD COLUMN IF NOT EXISTS signature_json JSONB;

CREATE INDEX IF NOT EXISTS idx_execution_trust_records_signature
ON execution_trust_records
USING GIN (signature_json);


-- =============================================================================
-- Source: supabase/migrations/20260707105527_enable_rls.sql
-- =============================================================================
-- Enable Row Level Security (deny-by-default)
-- =============================================================================
--
-- Security model: only the service-role key, held server-side by Parmana's
-- API (SupabaseClientFactory prefers SUPABASE_SERVICE_ROLE_KEY whenever it is
-- configured), accesses these tables; the service role bypasses RLS by
-- design, so this migration does not need FORCE ROW LEVEL SECURITY and does
-- not define any policy. With RLS enabled and no policy granted, the
-- auto-generated Data API surface is closed to the anon/authenticated roles
-- by default-deny — every one of these tables is otherwise directly
-- reachable through that API once RLS is off, bypassing Parmana's own
-- verification entirely.

ALTER TABLE business_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE execution_trust_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE executions ENABLE ROW LEVEL SECURITY;

ALTER TABLE overrides ENABLE ROW LEVEL SECURITY;

ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- Source: supabase/migrations/20260711120000_add_trust_record_sequence_columns.sql
-- =============================================================================
-- Add insertion-sequence tiebreak columns
-- =============================================================================
--
-- Purpose: CanonicalSerializer preserves array order when hashing an
-- ExecutionTrustRecord (packages/crypto/src/CanonicalSerializer.ts), so
-- findByTransactionId must reload each collection (executions, overrides,
-- verifications, receipts) in the exact order items were appended. The
-- existing timestamp columns (created_at / verified_at / issued_at) are only
-- millisecond-precision and can tie under concurrent or fast-sequential
-- appends; the primary keys are random UUIDs (crypto.randomUUID()) and carry
-- no ordering information. This adds a monotonic per-table sequence,
-- populated at insert time, to serve as an exact, collision-free tiebreak
-- alongside the existing timestamp ordering.
--
-- Note on backfill: for pre-existing rows, BIGSERIAL assigns values in heap
-- (physical storage) order, not guaranteed original insertion order. This is
-- acceptable here because seq is only ever used as a secondary tiebreak
-- after the primary timestamp sort, and every Execution Trust Record written
-- before this migration has at most a single element per collection, so no
-- existing row's relative order is observable or affected.

ALTER TABLE executions
ADD COLUMN IF NOT EXISTS seq BIGSERIAL;

ALTER TABLE overrides
ADD COLUMN IF NOT EXISTS seq BIGSERIAL;

ALTER TABLE verifications
ADD COLUMN IF NOT EXISTS seq BIGSERIAL;

ALTER TABLE receipts
ADD COLUMN IF NOT EXISTS seq BIGSERIAL;


-- =============================================================================
-- Source: supabase/migrations/20260718090000_add_nonce_and_caller_audit_tables.sql
-- =============================================================================
-- Durable replay protection and caller-audit trail (G-13)
-- =============================================================================
--
-- Closes G-13 (docs/VERIFICATION-GAPS.md): the production-default NonceStore
-- and CallerAuditSink were in-memory and reset on process restart. These two
-- tables back their durable, Supabase-backed replacements
-- (packages/storage/src/supabase/SupabaseNonceStore.ts,
-- packages/api/src/auth/SupabaseCallerAuditSink.ts).

-- -----------------------------------------------------------------------------
-- consumed_nonces
-- -----------------------------------------------------------------------------
--
-- Append-only. Application code never updates or deletes a row. The primary
-- key on nonce IS the atomic-consumption mechanism: two concurrent inserts of
-- the same nonce race at the database, and exactly one succeeds — the other
-- fails with a 23505 unique_violation, which SupabaseNonceStore maps to
-- "already consumed" (see packages/storage/src/errors/PostgresErrorCodes.ts).
-- No PII: a nonce is an opaque random token, not an identifier.

CREATE TABLE IF NOT EXISTS consumed_nonces (

    nonce TEXT PRIMARY KEY,

    -- From the envelope's own expiresAt (NonceStore.checkAndRecord's second
    -- argument) — the only extra field the existing NonceStore interface
    -- already carries. Not currently read back by application code; kept for
    -- a future retention/cleanup job (see VERIFICATION-GAPS.md G-13 residual
    -- note) to bound table growth by purging rows whose expiry has long
    -- since passed.
    expires_at TIMESTAMPTZ NOT NULL,

    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX IF NOT EXISTS idx_consumed_nonces_expires_at
ON consumed_nonces (
    expires_at
);

ALTER TABLE consumed_nonces ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- caller_audit_events
-- -----------------------------------------------------------------------------
--
-- Append-only. Mirrors packages/api/src/auth/CallerAuditSink.ts's
-- CallerAuditEvent shape exactly. caller_id is a configured identifier
-- (ApiKeyEntry.callerId), never the raw credential; reason is one of a fixed
-- set of short diagnostic strings ("invalid credential", "missing
-- credential") — no PII, no secret material.

CREATE TABLE IF NOT EXISTS caller_audit_events (

    id BIGSERIAL PRIMARY KEY,

    type TEXT NOT NULL
        CHECK (type IN ('caller.authenticated', 'caller.rejected')),

    occurred_at TIMESTAMPTZ NOT NULL,

    route TEXT NOT NULL,

    -- Present only for type = 'caller.authenticated'.
    caller_id TEXT,

    -- Present only for type = 'caller.rejected'. Never the credential itself.
    reason TEXT,

    inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX IF NOT EXISTS idx_caller_audit_events_occurred_at
ON caller_audit_events (
    occurred_at
);

CREATE INDEX IF NOT EXISTS idx_caller_audit_events_caller_id
ON caller_audit_events (
    caller_id
);

ALTER TABLE caller_audit_events ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- Source: supabase/migrations/20260718182238_add_razorpay_webhook_tables.sql
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


-- =============================================================================
-- Source: supabase/migrations/20260718190412_add_settlement_confirmations_and_audit_severity.sql
-- =============================================================================
-- Settlement confirmations and audit severity (M4b)
-- =============================================================================
--
-- Backs the durable, Supabase-backed settlement-confirmation infrastructure
-- introduced this session: packages/storage/src/supabase/
-- SupabaseExecutionTrustRecordRepository.ts's appendSettlementConfirmation,
-- and two new columns/values on the M4a webhook audit trail
-- (20260718182238_add_razorpay_webhook_tables.sql) to record settlement
-- PROCESSING outcomes, not just webhook DELIVERY outcomes.

-- -----------------------------------------------------------------------------
-- settlement_confirmations
-- -----------------------------------------------------------------------------
--
-- Append-only, mirrors the receipts table's shape exactly (see
-- 20260629013035_initial_schema.sql) — one row per SettlementConfirmation,
-- the full signed artifact stored verbatim in confirmation_json, plus a few
-- indexed columns for lookup. A row here is never mutated or deleted: the
-- Execution Trust Record's own trustRecordHash/signature and every existing
-- Receipt remain exactly as they were before this table existed.

CREATE TABLE IF NOT EXISTS settlement_confirmations (

    confirmation_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL,

    confirmation_json JSONB NOT NULL,

    issued_at TIMESTAMPTZ NOT NULL,

    seq BIGSERIAL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX IF NOT EXISTS idx_settlement_confirmations_business_transaction_id
ON settlement_confirmations (
    business_transaction_id
);

ALTER TABLE settlement_confirmations ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- razorpay_webhook_audit_events: settlement processing outcomes
-- -----------------------------------------------------------------------------
--
-- Widens the type CHECK constraint from 20260718182238 to add the four
-- settlement.* outcomes (settlement processing is a separate, out-of-band
-- step from webhook delivery — see packages/api/src/webhooks/
-- RazorpaySettlementProcessor.ts), and adds severity (elevated-severity
-- marker for settlement.failed / settlement.park_exhausted — "a refund's
-- lifecycle did not close cleanly," never silence), confirmation_id, and
-- fetched_refund_status (the fetch-verified, not webhook-claimed, status).

ALTER TABLE razorpay_webhook_audit_events
DROP CONSTRAINT IF EXISTS razorpay_webhook_audit_events_type_check;

ALTER TABLE razorpay_webhook_audit_events
ADD CONSTRAINT razorpay_webhook_audit_events_type_check
CHECK (type IN (
    'webhook.received',
    'webhook.duplicate',
    'webhook.rejected',
    'settlement.confirmed',
    'settlement.failed',
    'settlement.parked',
    'settlement.park_exhausted'
));

ALTER TABLE razorpay_webhook_audit_events
ADD COLUMN IF NOT EXISTS severity TEXT;

ALTER TABLE razorpay_webhook_audit_events
ADD COLUMN IF NOT EXISTS confirmation_id TEXT;

ALTER TABLE razorpay_webhook_audit_events
ADD COLUMN IF NOT EXISTS fetched_refund_status TEXT;

CREATE INDEX IF NOT EXISTS idx_razorpay_webhook_audit_events_severity
ON razorpay_webhook_audit_events (
    severity
)
WHERE severity IS NOT NULL;


-- =============================================================================
-- Source: supabase/migrations/20260802120000_add_refusal_records.sql
-- =============================================================================
-- RFC-0021
-- Refusal Records: durable, signed, third-party-verifiable evidence
-- of a policy REJECT.
-- =============================================================================
--
-- Scope is deliberately narrow: this table holds evidence for
-- PolicyEngine.evaluate REJECTs and SignalIntentBinder
-- binding-violation REJECTs only (see RuntimeEngine.execute()'s
-- writeRefusalRecord() call site) -- not caller-auth failures or
-- webhook signature failures (a separate, unsigned audit-sink
-- milestone: caller_audit_events / razorpay_webhook_audit_events).
--
-- signature_json is NOT NULL, unlike execution_trust_records'
-- (added later, nullable, via a retrofit migration) -- Refusal
-- Records ship signed from the start, no retrofit period.

CREATE TABLE IF NOT EXISTS refusal_records (

    refusal_record_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL UNIQUE,

    decision_json JSONB NOT NULL,

    evaluated_intent_json JSONB NOT NULL,

    binding_violations_json JSONB,

    submitted_by TEXT,

    refusal_record_hash TEXT NOT NULL,

    signature_json JSONB NOT NULL,

    -- Retention: currently indefinite, same policy as
    -- execution_trust_records. Revisit if REJECT volume ever grows
    -- significantly (RFC-0021 Open Question 3) -- not addressed by
    -- this migration.
    created_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_refusal_transaction
        FOREIGN KEY (
            business_transaction_id
        )
        REFERENCES business_transactions(
            business_transaction_id
        )
        ON DELETE RESTRICT

);

CREATE INDEX IF NOT EXISTS idx_refusal_records_created_at
ON refusal_records (
    created_at
);

ALTER TABLE refusal_records ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- Source: supabase/migrations/20260802130000_sign_audit_events.sql
-- =============================================================================
-- Audit-sink signing milestone (follows RFC-0021's Refusal Records)
-- =============================================================================
--
-- Adds a signature to the two existing durable audit trails
-- (caller_audit_events, razorpay_webhook_audit_events). Previously
-- these were plain rows: durable, but anyone with database access
-- could alter one with no way to detect it. SupabaseCallerAuditSink
-- and SupabaseRazorpayWebhookAuditSink now sign every event at write
-- time with the same key (DEFAULT_KEY_ID) ExecutionTrustRecord and
-- RefusalRecord already use — see @parmana/crypto's AuditEventCrypto.
--
-- Nullable, matching execution_trust_records.signature_json's own
-- precedent: both tables already had rows before this migration, and
-- this is additive, not a backfill. Existing rows remain unsigned,
-- honestly — every row written from here forward is signed.
--
-- Scope note: this does NOT cover policy/binding REJECTs
-- (PolicyEngine.evaluate, SignalIntentBinder) — those are
-- refusal_records (RFC-0021), a separate table and milestone.

ALTER TABLE caller_audit_events
ADD COLUMN IF NOT EXISTS signature_json JSONB;

ALTER TABLE razorpay_webhook_audit_events
ADD COLUMN IF NOT EXISTS signature_json JSONB;


-- =============================================================================
-- Source: supabase/migrations/20260803150000_add_challenge_records.sql
-- =============================================================================
-- RFC-0022
-- Challenge Records: a durable, structured trace from "an assumption
-- was questioned" to "what changed because of it."
-- =============================================================================
--
-- Deliberately NOT signed (RFC-0022 § Proposal 3 -- no signature_json
-- column here, unlike refusal_records/execution_trust_records). A
-- ChallengeRecord is evidence of an organizational process, not a
-- runtime transaction outcome; the party who could misrepresent it is
-- the same party who writes it, so a signature would prove
-- tamper-evidence of bytes-on-disk while leaving the actual trust
-- question (was the investigation honest) unaddressed. Trustworthy
-- instead through citation discipline and, where applicable, public
-- disclosure -- see the domain type's own doc comment
-- (packages/shared/src/domain/challenge-record.ts).
--
-- Unlike refusal_records (a single terminal row per transaction), a
-- Challenge Record is investigated over real time: investigation_
-- steps_json accumulates and status/finding/outcome/disclosure are
-- set via UPDATE as the investigation proceeds
-- (PostgresChallengeRecordRepository.append), enforced append-only at
-- the application layer (applyChallengeRecordAppend), not by any
-- database-level trigger or constraint -- this table has no unique
-- business-transaction relationship to key off of the way
-- refusal_records does, since a challenge need not be about any one
-- transaction at all.
--
-- No PostgREST/supabase-js dependency for this table's application
-- code (PostgresChallengeRecordRepository writes via a direct
-- Postgres connection, per the audit-sink signing milestone's own
-- workaround) -- this migration itself is still applied the normal
-- way, through the Supabase project's own Postgres, identically to
-- every other table in this directory.

CREATE TABLE IF NOT EXISTS challenge_records (

    challenge_record_id TEXT PRIMARY KEY,

    status TEXT NOT NULL
        CHECK (status IN ('open', 'investigating', 'resolved')),

    claim_challenged TEXT NOT NULL,

    source_json JSONB NOT NULL,

    investigation_steps_json JSONB NOT NULL DEFAULT '[]'::jsonb,

    finding_json JSONB,

    outcome_json JSONB,

    disclosure_json JSONB,

    -- The prior challenge_record_id this one supersedes/follows up
    -- on. No FK constraint: deliberately tolerant of a superseded
    -- record being pruned independently in the future (retention
    -- policy is an open question, RFC-0022 Open Question 2), and a
    -- forward reference would otherwise have to be nullable/deferred
    -- anyway for the common "no prior record" case.
    supersedes TEXT,

    created_at TIMESTAMPTZ NOT NULL,

    updated_at TIMESTAMPTZ NOT NULL

);

CREATE INDEX IF NOT EXISTS idx_challenge_records_status
ON challenge_records (
    status
);

CREATE INDEX IF NOT EXISTS idx_challenge_records_created_at
ON challenge_records (
    created_at
);

ALTER TABLE challenge_records ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- Source: supabase/migrations/20260805170000_add_razorpay_daily_refund_reservations.sql
-- =============================================================================
-- Razorpay daily cumulative refund reservation ledger (TD-23 closure, Phase 3B)
-- =============================================================================
--
-- Backs RazorpayDailyRefundLedger's atomic reserve()/release() operations
-- (packages/storage/src/supabase/SupabaseRazorpayDailyRefundLedger.ts).
--
-- Closes an independently-verified gap (Phase 2L, Phase 3A): the
-- razorpay-refund/1.0.0 policy's daily cumulative cap was previously
-- enforced against a caller-declared signal
-- (dailyCumulativeAfterThisRefundPaise) with no independent verification --
-- a caller could declare any value regardless of real refund history.
--
-- This is a single-row-per-day atomic counter, not a transaction ledger or a
-- duplicate of Trust Record history: it stores nothing about individual
-- refunds, only a running total per UTC calendar day. The authoritative
-- record of what actually executed remains the existing executions table
-- (see ExecutionTrustRecordRepository.sumSuccessfulExecutionAmounts, added
-- alongside this migration for reconciliation/observability) -- this table
-- exists solely to make "read the current total, then decide, then commit"
-- atomic across concurrent requests, which a SELECT-then-write over the
-- executions table cannot be, since a real Razorpay API call (which cannot
-- be wrapped in a database transaction) sits between the decision and the
-- executions row that would eventually record it.
--
-- Atomicity: reserve() is a single INSERT ... ON CONFLICT (refund_day) DO
-- UPDATE ... RETURNING statement. Two concurrent reservations for the same
-- day are serialized by Postgres's own row lock on that day's row -- the
-- same class of atomicity consumed_nonces's and razorpay_webhook_events's
-- primary keys already provide for uniqueness checks, applied here to an
-- additive counter instead.

CREATE TABLE IF NOT EXISTS razorpay_daily_refund_reservations (

    refund_day DATE PRIMARY KEY,

    reserved_paise BIGINT NOT NULL DEFAULT 0,

    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_reserved_paise_non_negative CHECK (reserved_paise >= 0)

);

ALTER TABLE razorpay_daily_refund_reservations ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- Source: supabase/migrations/20260805180000_add_consumed_approval_nonces.sql
-- =============================================================================
-- Approval Artifact replay protection (TD-23 closure, Phase 3C)
-- =============================================================================
--
-- Backs SupabaseApprovalNonceStore's atomic checkAndRecord()
-- (packages/storage/src/supabase/SupabaseApprovalNonceStore.ts), the
-- durable NonceStore ApprovalVerifier uses to enforce that a Signed
-- Approval Artifact is consumed at most once.
--
-- Deliberately a separate table from consumed_nonces
-- (20260718090000_add_nonce_and_caller_audit_tables.sql), not a shared
-- one: an Approval Artifact's nonce and a Gateway Authorization
-- envelope's nonce are distinct trust domains issued by distinct
-- parties (an external business approver vs. Parmana's own runtime).
-- Sharing one table would let a coincidental nonce collision between
-- the two unrelated namespaces falsely report "already consumed" for
-- one because of the other.
--
-- Same shape, same atomicity mechanism, same reasoning as
-- consumed_nonces: append-only, the PRIMARY KEY on nonce IS the
-- atomic-consumption mechanism (two concurrent inserts of the same
-- nonce race at the database; exactly one succeeds, the other fails
-- with a 23505 unique_violation, mapped to "already consumed"). No
-- PII: a nonce is an opaque, single-use token chosen by the artifact's
-- issuer, not an identifier.

CREATE TABLE IF NOT EXISTS consumed_approval_nonces (

    nonce TEXT PRIMARY KEY,

    -- From the artifact's own expiresAt (NonceStore.checkAndRecord's
    -- second argument). Not currently read back by application code;
    -- kept for a future retention/cleanup job, mirroring
    -- consumed_nonces.expires_at's own residual note.
    expires_at TIMESTAMPTZ NOT NULL,

    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX IF NOT EXISTS idx_consumed_approval_nonces_expires_at
ON consumed_approval_nonces (
    expires_at
);

ALTER TABLE consumed_approval_nonces ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- Source: supabase/migrations/20260812120000_add_capability_to_caller_audit_events.sql
-- =============================================================================
-- Caller-capability-scoping audit trail (caller-to-capability scoping)
-- =============================================================================
--
-- Backs CallerAuditEvent's new "caller.capability_denied" type and
-- `capability` field (packages/api/src/auth/CallerAuditSink.ts,
-- packages/api/src/routes/execute.ts / transactions.ts): an
-- authenticated caller attempting a capability outside its
-- ApiKeyEntry.allowedCapabilities is denied, and that denial is
-- audited the same way a missing/invalid credential already is.
--
-- Widens the type CHECK constraint from 20260718090000 to add the
-- new event type, mirroring 20260718190412's DROP/ADD CONSTRAINT
-- pattern for razorpay_webhook_audit_events. Adds `capability`,
-- nullable and additive like every prior column addition to this
-- table (signature_json, 20260802130000) -- existing rows are
-- unaffected, every row written from here forward that concerns a
-- specific capability carries it.

ALTER TABLE caller_audit_events
DROP CONSTRAINT IF EXISTS caller_audit_events_type_check;

ALTER TABLE caller_audit_events
ADD CONSTRAINT caller_audit_events_type_check
CHECK (type IN (
    'caller.authenticated',
    'caller.rejected',
    'caller.capability_denied'
));

ALTER TABLE caller_audit_events
ADD COLUMN IF NOT EXISTS capability TEXT;

CREATE INDEX IF NOT EXISTS idx_caller_audit_events_capability
ON caller_audit_events (
    capability
)
WHERE capability IS NOT NULL;


-- =============================================================================
-- Source: supabase/migrations/20260816120000_add_principal_to_caller_audit_events.sql
-- =============================================================================
-- Caller-principal-binding audit trail (caller-to-principal scoping)
-- =============================================================================
--
-- Backs CallerAuditEvent's new "caller.principal_denied" type and
-- `principal_id` field (packages/api/src/auth/CallerAuditSink.ts,
-- packages/api/src/routes/execute.ts / transactions.ts): an
-- authenticated caller attempting to assert an authority.principalId
-- outside its ApiKeyEntry.allowedPrincipalIds is denied, and that
-- denial is now audited the same way caller.capability_denied already
-- is (20260812120000_add_capability_to_caller_audit_events.sql).
--
-- Widens the type CHECK constraint from 20260812120000 to add the
-- new event type, mirroring that migration's own DROP/ADD CONSTRAINT
-- pattern, which itself mirrored 20260718190412's for
-- razorpay_webhook_audit_events. Adds `principal_id`, nullable and
-- additive like every prior column addition to this table
-- (signature_json, 20260802130000; capability, 20260812120000) --
-- existing rows are unaffected, every row written from here forward
-- that concerns a specific principal-binding denial carries it.

ALTER TABLE caller_audit_events
DROP CONSTRAINT IF EXISTS caller_audit_events_type_check;

ALTER TABLE caller_audit_events
ADD CONSTRAINT caller_audit_events_type_check
CHECK (type IN (
    'caller.authenticated',
    'caller.rejected',
    'caller.capability_denied',
    'caller.principal_denied'
));

ALTER TABLE caller_audit_events
ADD COLUMN IF NOT EXISTS principal_id TEXT;

CREATE INDEX IF NOT EXISTS idx_caller_audit_events_principal_id
ON caller_audit_events (
    principal_id
)
WHERE principal_id IS NOT NULL;


-- =============================================================================
-- Source: supabase/migrations/20260818120000_add_policy_governance_tables.sql
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


-- =============================================================================
-- Source: supabase/migrations/20260818130000_add_non_human_denied_to_caller_audit_events.sql
-- =============================================================================
-- Non-human-caller-denied audit trail (Policy Governance, maker-checker)
-- =============================================================================
--
-- Backs CallerAuditEvent's new "caller.non_human_denied" type and
-- `severity` field (packages/api/src/auth/CallerAuditSink.ts,
-- packages/api/src/routes/pending-policy-changes.ts): a caller whose
-- credential is not provisioned as a verified human
-- (ApiKeyEntry.credentialHolderType !== "USER", see isHumanCaller.ts)
-- attempting one of the four Policy Governance endpoints is denied,
-- and that denial is now audited the same way caller.capability_denied
-- and caller.principal_denied already are.
--
-- Widens the type CHECK constraint from 20260816120000 to add the new
-- event type, mirroring that migration's own DROP/ADD CONSTRAINT
-- pattern. Adds `severity`, nullable and additive like every prior
-- column addition to this table (signature_json, 20260802130000;
-- capability, 20260812120000; principal_id, 20260816120000) --
-- existing rows are unaffected. Mirrors the elevated-severity marker
-- already established for razorpay_webhook_audit_events
-- (20260718190412_add_settlement_confirmations_and_audit_severity.sql)
-- rather than inventing a second convention for the same concept.

ALTER TABLE caller_audit_events
DROP CONSTRAINT IF EXISTS caller_audit_events_type_check;

ALTER TABLE caller_audit_events
ADD CONSTRAINT caller_audit_events_type_check
CHECK (type IN (
    'caller.authenticated',
    'caller.rejected',
    'caller.capability_denied',
    'caller.principal_denied',
    'caller.non_human_denied'
));

ALTER TABLE caller_audit_events
ADD COLUMN IF NOT EXISTS severity TEXT;

CREATE INDEX IF NOT EXISTS idx_caller_audit_events_severity
ON caller_audit_events (
    severity
)
WHERE severity IS NOT NULL;


-- =============================================================================
-- Source: supabase/migrations/20260818140000_add_consumed_policy_change_step_up_nonces.sql
-- =============================================================================
-- Policy Change Step-Up Authorization replay protection (Policy
-- Governance, maker-checker, Layer 4)
-- =============================================================================
--
-- Backs SupabasePolicyChangeStepUpNonceStore's atomic checkAndRecord()
-- (packages/storage/src/supabase/SupabasePolicyChangeStepUpNonceStore.ts),
-- the durable NonceStore PolicyChangeStepUpVerifier uses to enforce
-- that a signed step-up envelope on POST /policies/pending-changes/:id/
-- approve or .../reject is consumed at most once.
--
-- Deliberately a separate table from both consumed_nonces
-- (20260718090000, ExecutionGateway's own Authorization-envelope
-- replay protection) and consumed_approval_nonces (20260805180000,
-- Approval Artifact replay protection): a step-up envelope's nonce is
-- issued by yet another distinct trust domain -- an individual human
-- checker's own key, provisioned once via generate-api-key.ts's
-- --generate-step-up-key flag -- and sharing a table with either of
-- the other two would let a coincidental nonce collision between
-- unrelated namespaces falsely report "already consumed," and would
-- couple three independent replay-protection concerns' retention/
-- cleanup lifecycles together for no benefit.
--
-- Same shape, same atomicity mechanism, same reasoning as
-- consumed_nonces/consumed_approval_nonces: append-only, the PRIMARY
-- KEY on nonce IS the atomic-consumption mechanism (two concurrent
-- inserts of the same nonce race at the database; exactly one
-- succeeds, the other fails with a 23505 unique_violation, mapped to
-- "already consumed"). No PII: a nonce is an opaque, single-use token
-- chosen by the envelope's signer, not an identifier.

CREATE TABLE IF NOT EXISTS consumed_policy_change_step_up_nonces (

    nonce TEXT PRIMARY KEY,

    -- From the envelope's own expiresAt (NonceStore.checkAndRecord's
    -- second argument). Not currently read back by application code;
    -- kept for a future retention/cleanup job, mirroring
    -- consumed_nonces.expires_at's own residual note.
    expires_at TIMESTAMPTZ NOT NULL,

    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX IF NOT EXISTS idx_consumed_policy_change_step_up_nonces_expires_at
ON consumed_policy_change_step_up_nonces (
    expires_at
);

ALTER TABLE consumed_policy_change_step_up_nonces ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- Source: supabase/migrations/20260818150000_add_ci_read_only_policy_for_approval_records.sql
-- =============================================================================
-- CI read-only access to Policy Change Approval Records (Policy
-- Governance, maker-checker, preventive CI/deploy-time gate)
-- =============================================================================
--
-- Backs scripts/verify-policy-changes-approved.ts: a CI check that
-- confirms every changed policies/{name}/{version}/policy.json in a
-- PR has a matching, real PolicyChangeApprovalRecord before it can
-- merge -- closing the gap the independent audit found, that a direct
-- file edit to policies/*.json bypasses the maker-checker API
-- entirely and is only ever *detected*, after the fact, by
-- verifyPolicyGovernanceIntegrityAtStartup.ts's own fail-open startup
-- check, never prevented.
--
-- policy_change_approval_records already has ENABLE ROW LEVEL
-- SECURITY (20260818120000) with zero policies -- meaning, before
-- this migration, it is unreadable by every role except one with
-- BYPASSRLS (the app's own DATABASE_URL connection). CI has never had
-- any Supabase credential at all (see .github/workflows/ci.yml). Deliberately
-- NOT reusing the app's own DATABASE_URL or SUPABASE_SERVICE_ROLE_KEY for
-- this -- both bypass RLS entirely and grant read+write on every table in
-- the schema, not read-only access to this one. This migration adds the
-- single minimal policy needed instead: read-only, this table only, via
-- the low-privilege `anon` role and SUPABASE_ANON_KEY -- a new credential
-- CI is given for the first time here, scoped to exactly this and nothing
-- else, so a leak of it (CI logs, a compromised workflow) cannot write
-- anything or read any other table.
--
-- The explicit GRANT below is defensive, not strictly required under
-- Supabase's own default project bootstrapping (which already grants
-- anon/authenticated base SELECT on public-schema tables; RLS is what
-- was actually blocking reads here) -- included so this migration is
-- correct and self-contained even against a non-default grant setup,
-- consistent with this file's own "safe to re-run, nothing assumed"
-- convention.

GRANT SELECT ON policy_change_approval_records TO anon;

-- Postgres has no CREATE POLICY IF NOT EXISTS -- drop-then-create,
-- the same self-guarding re-run pattern this file's own header
-- comment documents for constraints.
DROP POLICY IF EXISTS "ci_read_only_select" ON policy_change_approval_records;

CREATE POLICY "ci_read_only_select" ON policy_change_approval_records
    FOR SELECT
    TO anon
    USING (true);


-- =============================================================================
-- Source: supabase/migrations/20260824090000_add_structural_rejected_to_caller_audit_events.sql
-- =============================================================================
-- Structural-validation rejection audit trail (G-29)
-- =============================================================================
--
-- Backs CallerAuditEvent's new "caller.structural_rejected" type and
-- `business_transaction_id` field (packages/api/src/auth/CallerAuditSink.ts,
-- packages/api/src/middleware/error-handler.ts,
-- packages/api/src/routes/execute.ts / transactions.ts): before this
-- migration, a malformed request body, a malformed businessTransactionId,
-- a structurally invalid Business Transaction, or a duplicate
-- businessTransactionId was rejected with the correct HTTP status but left
-- no durable trace anywhere in this system — unlike a policy REJECT
-- (RefusalRecord, RFC-0021) or a caller-identity denial
-- (caller.capability_denied / caller.principal_denied), both already
-- audited.
--
-- Widens the type CHECK constraint from 20260818130000 to add the new
-- event type, mirroring every prior widening of this same constraint
-- (20260812120000, 20260816120000, 20260818130000, each mirroring
-- 20260718190412's for razorpay_webhook_audit_events in turn). Adds
-- `business_transaction_id`, nullable and additive like every prior
-- column addition to this table (signature_json, 20260802130000;
-- capability, 20260812120000; principal_id, 20260816120000) -- existing
-- rows are unaffected.

ALTER TABLE caller_audit_events
DROP CONSTRAINT IF EXISTS caller_audit_events_type_check;

ALTER TABLE caller_audit_events
ADD CONSTRAINT caller_audit_events_type_check
CHECK (type IN (
    'caller.authenticated',
    'caller.rejected',
    'caller.capability_denied',
    'caller.principal_denied',
    'caller.non_human_denied',
    'caller.structural_rejected'
));

ALTER TABLE caller_audit_events
ADD COLUMN IF NOT EXISTS business_transaction_id TEXT;

CREATE INDEX IF NOT EXISTS idx_caller_audit_events_business_transaction_id
ON caller_audit_events (
    business_transaction_id
)
WHERE business_transaction_id IS NOT NULL;


-- =============================================================================
-- Source: supabase/migrations/20260906120000_add_per_caller_chain_to_caller_audit_events.sql
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


-- =============================================================================
-- Source: supabase/migrations/20260907120000_add_authorization_and_hybrid_signatures_to_execution_trust_records.sql
-- =============================================================================
-- Persist Signed Execution Authorization + Hybrid Signatures on
-- execution_trust_records
--
-- authorization_json: the SignedExecutionAuthorization ExecutionGateway
-- accepted for this transaction (ExecutionTrustRecord.authorization).
-- Nullable: absent for records built before this column existed, or for
-- a transaction that never reached execution (e.g. a policy rejection).
--
-- schema_version / signatures_json: ExecutionTrustRecord.schemaVersion /
-- .signatures, added by the Hybrid Signature Support milestone
-- (20260702183000_add_signature_to_execution_trust_records.sql added
-- signature_json for the legacy single signature, but schemaVersion/
-- signatures were never given columns here -- a CRYPTO_MODE=hybrid
-- record round-tripped through Supabase silently lost its second
-- signature on read, degrading hybrid verification to single-signature
-- for anything reloaded from durable storage). Both nullable for the
-- same reason: absent means schema v1 (see execution-trust-record.ts's
-- own doc comment on schemaVersion), not "hybrid signing failed."
-- =============================================================================

ALTER TABLE execution_trust_records
ADD COLUMN IF NOT EXISTS authorization_json JSONB;

ALTER TABLE execution_trust_records
ADD COLUMN IF NOT EXISTS schema_version INTEGER;

ALTER TABLE execution_trust_records
ADD COLUMN IF NOT EXISTS signatures_json JSONB;

CREATE INDEX IF NOT EXISTS idx_execution_trust_records_authorization
ON execution_trust_records
USING GIN (authorization_json);


-- =============================================================================
-- Source: supabase/migrations/20260907130000_add_previous_record_hash_to_policy_change_approval_records.sql
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


-- =============================================================================
-- Source: supabase/migrations/20260910120000_add_rate_limit_counters.sql
-- =============================================================================
-- Fleet-wide POST /execute and /health,/ready rate limiting.
-- =============================================================================
--
-- Backs PostgresRateLimitStore (packages/storage/src/postgres/
-- PostgresRateLimitStore.ts), the durable counterpart to
-- express-rate-limit's default in-process MemoryStore. Closes the
-- fleet-wide half of the rate-limiter gap identified in the 2026-09-10
-- production-readiness pass: a MemoryStore-backed limiter is correct
-- for a single process, but each machine in a horizontally-scaled
-- deployment counts independently, so a caller's effective ceiling
-- becomes `limitPerMinute * machineCount` rather than the configured
-- fleet-wide limit.
--
-- One row per rate-limit key (an authenticated caller id for
-- /execute, a client IP for /health and /ready -- see
-- packages/api/src/middleware/rate-limit.ts). `count` and
-- `reset_time` are read and written together, atomically, by
-- PostgresRateLimitStore's single upsert statement -- no separate
-- locking is required here.
--
-- Not RLS-covered: unlike the other tables in this schema, rows here
-- carry no business or trust-record data, only ephemeral counters
-- that this codebase's own application logic is the sole reader/
-- writer of (no end-user or dashboard access path exists), so a
-- restrictive policy set would add operational surface without a
-- corresponding threat this table is exposed to.
create table if not exists rate_limit_counters (
  key text primary key,
  count integer not null,
  reset_time timestamptz not null
);

-- Lets a periodic housekeeping job (none exists yet; this index is
-- what such a job would use) cheaply find and delete rows whose window
-- has long since elapsed, without a full table scan. The table
-- self-corrects even without one: increment()'s own upsert resets an
-- expired row's count back to 1 the next time that key is hit, so this
-- index is a cleanup convenience, not a correctness requirement.
create index if not exists rate_limit_counters_reset_time_idx
  on rate_limit_counters (reset_time);


-- =============================================================================
-- Source: supabase/migrations/20260911090000_add_capability_granted_to_caller_audit_events.sql
-- =============================================================================
-- Fix: caller.capability_granted was never a valid caller_audit_events.type
-- =============================================================================
--
-- packages/api/src/routes/execute.ts and transactions.ts (see
-- docs/VERIFICATION-GAPS.md gap 33 / docs/CLAIMS.md NF-004) both write a
-- "caller.capability_granted" CallerAuditEvent on every successful,
-- authenticated capability check -- but no prior migration ever added
-- that value to this table's type CHECK constraint. The constraint most
-- recently widened by 20260824090000_add_structural_rejected_to_caller_audit_events.sql
-- only allowed 'caller.authenticated', 'caller.rejected',
-- 'caller.capability_denied', 'caller.principal_denied',
-- 'caller.non_human_denied', 'caller.structural_rejected'.
--
-- Effect in a real deployment (PARMANA_STORAGE backed by a live Postgres
-- audit sink, caller-auth enabled): every successful, authenticated
-- POST /execute or POST /transactions call fails closed with 503
-- AUDIT_UNAVAILABLE before ever reaching Policy Engine evaluation, since
-- the audit write itself is rejected by Postgres. Invisible in the
-- existing test suite because Supabase-backed integration tests are
-- opt-in (ALLOW_LIVE_SUPABASE=1); an in-memory audit sink has no such
-- constraint to violate.
--
-- Widens the constraint the same way each of its four prior widenings
-- did (20260812120000, 20260816120000, 20260818130000, 20260824090000).

ALTER TABLE caller_audit_events
DROP CONSTRAINT IF EXISTS caller_audit_events_type_check;

ALTER TABLE caller_audit_events
ADD CONSTRAINT caller_audit_events_type_check
CHECK (type IN (
    'caller.authenticated',
    'caller.rejected',
    'caller.capability_denied',
    'caller.principal_denied',
    'caller.non_human_denied',
    'caller.structural_rejected',
    'caller.capability_granted'
));


-- =============================================================================
-- Source: supabase/migrations/20260914120000_add_execution_audit_events.sql
-- =============================================================================
-- Durable execution-audit trail (GAP-1, GAPS.md 2026-09-14)
-- =============================================================================
--
-- Closes GAP-1: execution.rejected/execution.completed/session.created events
-- (packages/execution-control/src/ExecutionControlService.ts) were previously
-- recorded to MemoryExecutionAuditSink only -- lost on process restart, not
-- queryable outside the running process. This table backs its durable,
-- Supabase-backed replacement (packages/storage/src/supabase/
-- SupabaseExecutionAuditSink.ts). MemoryExecutionAuditSink remains correct for
-- tests -- see packages/api/src/bootstrap/createExecutionAuditSink.ts.
--
-- Mirrors caller_audit_events (supabase/migrations/20260718090000_add_nonce_
-- and_caller_audit_tables.sql) in shape and discipline: append-only, signed at
-- write time, chained so a deleted or altered row is detectable. Chained per
-- authorizationId rather than per caller -- one authorization's full
-- execution lifecycle (session.created -> execution.completed or
-- execution.rejected) is exactly the unit a regulator asks about ("show me
-- everything that happened for this refund's authorization"), and unlike
-- caller_audit_events this table has no per-caller identity to chain against
-- at all (an authorizationId is not a caller).

CREATE TABLE IF NOT EXISTS execution_audit_events (

    id BIGSERIAL PRIMARY KEY,

    type TEXT NOT NULL
        CHECK (type IN ('session.created', 'execution.completed', 'execution.rejected')),

    occurred_at TIMESTAMPTZ NOT NULL,

    connector_id TEXT NOT NULL,

    authorization_id TEXT NOT NULL,

    session_id TEXT NOT NULL,

    -- The ExecutableContent.action this event concerns (the capability
    -- released or rejected, e.g. "paytm:refund"). Present on every event
    -- ExecutionControlService.execute() records; nullable here only to
    -- match ExecutionAuditEvent.action's own optional typing.
    action TEXT,

    -- Present only on type = 'execution.rejected'. Never the credential
    -- itself -- the connector's own thrown Error message.
    reason TEXT,

    -- Metadata only, per ExecutionAuditEvent's own doc comment -- never a
    -- credential's secret value.
    credential_id TEXT,
    gateway_id TEXT,

    signature_json JSONB NOT NULL,

    -- Chain per authorizationId: previous_chain_hash is that
    -- authorization's own immediately-preceding event's chain_hash (NULL
    -- for its first event), chain_position a 1-based per-authorization
    -- sequence number. Every event carries an authorizationId (unlike
    -- caller_audit_events, where some events have no callerId at all), so
    -- these two columns are NOT NULL here.
    chain_hash TEXT NOT NULL,
    previous_chain_hash TEXT,
    chain_position INTEGER NOT NULL,

    inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX IF NOT EXISTS idx_execution_audit_events_occurred_at
ON execution_audit_events (
    occurred_at
);

CREATE INDEX IF NOT EXISTS idx_execution_audit_events_authorization_id
ON execution_audit_events (
    authorization_id
);

CREATE INDEX IF NOT EXISTS idx_execution_audit_events_connector_id
ON execution_audit_events (
    connector_id
);

ALTER TABLE execution_audit_events ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- Source: supabase/migrations/20260914130000_add_business_transaction_correlation_to_execution_audit_events.sql
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


-- =============================================================================
-- Source: supabase/migrations/20260914140000_add_authorization_verified_to_execution_audit_events.sql
-- =============================================================================
-- Add 'authorization.verified' to execution_audit_events.type (GAP-3)
-- =============================================================================
--
-- parmana-paytm-agent's own audit writer (src/parmana/audit.ts in that
-- repository) records two events per POST /connector/paytm-refund request,
-- not one: 'authorization.verified' right after
-- verifyPaytmAuthorizationSignature succeeds, and 'execution.completed' or
-- 'execution.rejected' after the Paytm call resolves. Two rows, not one,
-- because a crash between those two points (verified, then never actually
-- executed) is exactly the failure mode an audit trail exists to catch --
-- collapsing them into a single row would silently lose that evidence.
--
-- Widened the same way caller_audit_events' own type CHECK constraint has
-- been widened repeatedly (20260812120000, 20260816120000, 20260818130000,
-- 20260824090000, 20260911090000): drop and recreate, adding the one new
-- value.

ALTER TABLE execution_audit_events
DROP CONSTRAINT IF EXISTS execution_audit_events_type_check;

ALTER TABLE execution_audit_events
ADD CONSTRAINT execution_audit_events_type_check
CHECK (type IN (
    'session.created',
    'execution.completed',
    'execution.rejected',
    'authorization.verified'
));


-- =============================================================================
-- Source: supabase/migrations/20260916060000_add_policies_table.sql
-- =============================================================================
-- Policy content storage (Supabase-backed PolicyRepository)
--
-- Policies were previously stored only as policy.json files under
-- PARMANA_POLICY_DIR (FilePolicyRepository). That works for local
-- development, but Vercel's serverless Functions run on a read-only
-- filesystem: PolicyChangeApprovalService.approve()'s live-policy
-- write (see that file's own doc comment) fails with EROFS the moment
-- a checker approves a pending change in production. This table gives
-- SupabasePolicyRepository somewhere writable to persist the same
-- (name, version) -> content mapping FilePolicyRepository already
-- modeled, so approve() succeeds against the deployed API the same
-- way it already does in local dev and tests.
-- =============================================================================

CREATE TABLE IF NOT EXISTS policies (

    policy_name TEXT NOT NULL,

    policy_version TEXT NOT NULL,

    content_json JSONB NOT NULL,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (policy_name, policy_version)

);

ALTER TABLE policies ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- Source: supabase/migrations/20260916120000_drop_razorpay_tables.sql
-- =============================================================================
-- Drop orphaned Razorpay tables (Razorpay connector removed 2026-08-12)
-- =============================================================================
--
-- The Razorpay connector and its `payments:execute`/vendor-payment capability
-- were removed from this codebase entirely on 2026-08-12 (docs/CLAIMS.md,
-- docs/VERIFICATION-GAPS.md G-27) -- it was never a real, production-reachable
-- capability. The vendor-payment *policy file* and shared test fixtures using
-- it as generic example data were deliberately retained (no execution risk,
-- no connector able to back them) -- these three tables were not, and are
-- confirmed orphaned:
--
--   - razorpay_webhook_events (20260718182238_add_razorpay_webhook_tables.sql)
--   - razorpay_webhook_audit_events (same migration)
--   - razorpay_daily_refund_reservations (20260805170000_add_razorpay_daily_refund_reservations.sql)
--
-- Confirmed before dropping (2026-09-16):
--   - Only one file in packages/ references any of these table names at all
--     (packages/api/tests/integration/refusal-record.integration.test.ts),
--     incidentally, not as functional table access.
--   - razorpay_webhook_events and razorpay_daily_refund_reservations had zero
--     rows. razorpay_webhook_audit_events had 7 historical rows, backed up
--     before this migration ran (not committed to this repo -- historical
--     data, not schema).
--   - No foreign key from any other table references any of the three.
--
-- Order matters only for readability here -- no FK dependencies exist between
-- these three tables or from any other table onto them.

DROP TABLE IF EXISTS razorpay_daily_refund_reservations;

DROP TABLE IF EXISTS razorpay_webhook_audit_events;

DROP TABLE IF EXISTS razorpay_webhook_events;


-- =============================================================================
-- Source: supabase/migrations/20260916150000_add_handbook_download_leads.sql
-- =============================================================================
-- Handbook download leads
--
-- Backs the email-gated PDF download at docs/site/handbook/download.mdx
-- (POST /handbook/download-leads). Deliberately simple: an email
-- address is required before the PDF link unlocks, but no
-- verification email is sent -- this table exists to record who
-- asked for the download, not to gate access behind a confirmed
-- inbox. If double opt-in verification is ever added, it belongs in
-- a separate migration, not folded into this one.
-- =============================================================================

CREATE TABLE IF NOT EXISTS handbook_download_leads (

    handbook_download_lead_id TEXT PRIMARY KEY,

    email TEXT NOT NULL,

    captured_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX IF NOT EXISTS idx_handbook_download_leads_captured_at
ON handbook_download_leads (
    captured_at DESC
);

ALTER TABLE handbook_download_leads ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- Source: supabase/migrations/20260921120000_add_execution_intents.sql
-- =============================================================================
-- ADR-0012
-- Execution Intents: a signed statement, persisted BEFORE an action is released
-- to a connector, of exactly what is about to be released.
-- =============================================================================
--
-- Why this exists: the Execution Trust Record contains the execution result, so
-- it can only be built after release. If it cannot be built or stored, an
-- executed action has no signed record (docs/VERIFICATION-GAPS.md G-52 and
-- G-53). The intent is signed and stored first, so an action that was released
-- always has signed evidence behind it.
--
-- Two kinds of column live here on purpose:
--
--   * The signed intent (intent_id through created_at, plus intent_hash and
--     signature_json). Immutable. It never contains the execution result or the
--     raw intent parameters.
--   * Operational status (state and everything after it). NOT signed. It moves
--     as the request progresses and is what the repair operation reads.
--
-- released_context_json holds the execution context saved right after the
-- connector answered. It is what lets the Trust Record be rebuilt when the
-- record could not be produced inline, without calling the connector again.
--
-- This migration only adds a table. It changes no existing table, and
-- transactions that predate it simply have no intent row.

CREATE TABLE IF NOT EXISTS execution_intents (

    intent_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL UNIQUE,

    decision_id TEXT NOT NULL,

    authorization_id TEXT NOT NULL,

    policy_name TEXT NOT NULL,

    policy_version TEXT NOT NULL,

    policy_content_hash TEXT,

    signals_hash TEXT,

    business_transaction_hash TEXT NOT NULL,

    action TEXT NOT NULL,

    target TEXT NOT NULL,

    submitted_by TEXT,

    granted_capability TEXT,

    intent_hash TEXT NOT NULL,

    signature_json JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL,

    -- Operational status below this line. Not part of the signature.

    state TEXT NOT NULL DEFAULT 'PREPARED'
        CHECK (state IN ('PREPARED', 'RELEASED', 'FINALIZED', 'ERRORED', 'RESOLVED')),

    released_context_json JSONB,

    released_at TIMESTAMPTZ,

    finalized_at TIMESTAMPTZ,

    finalization_mode TEXT
        CHECK (finalization_mode IN ('INLINE', 'REPAIRED')),

    trust_record_id TEXT,

    failure_reason TEXT,

    -- Set only when a verified human closed a PREPARED or ERRORED intent after
    -- reconciling it at the connector (state RESOLVED). This is an attributed
    -- operator statement in unsigned status. It is not tamper evident.
    resolution TEXT
        CHECK (resolution IN ('NOT_EXECUTED', 'EXECUTED')),

    resolution_note TEXT,

    resolved_by TEXT,

    resolved_at TIMESTAMPTZ,

    CONSTRAINT execution_intent_resolved_is_complete
        CHECK (
            state <> 'RESOLVED'
            OR (
                resolution IS NOT NULL
                AND resolution_note IS NOT NULL
                AND resolved_at IS NOT NULL
            )
        ),

    CONSTRAINT fk_execution_intent_transaction
        FOREIGN KEY (
            business_transaction_id
        )
        REFERENCES business_transactions(
            business_transaction_id
        )
        ON DELETE RESTRICT

);

-- Operators look for intents that never reached a signed Trust Record and were
-- not closed by hand. A partial index keeps that lookup cheap without indexing
-- every finalized or resolved row.
CREATE INDEX IF NOT EXISTS idx_execution_intents_unfinalized
ON execution_intents (
    created_at
)
WHERE state NOT IN ('FINALIZED', 'RESOLVED');

ALTER TABLE execution_intents ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- Source: supabase/migrations/20260929120000_add_approval_issuers.sql
-- =============================================================================
-- Approvers managed without a deploy
--
-- An approver key trusted to sign Approval Artifacts used to exist only
-- in createApprovalIssuerRegistry.ts, so adding or revoking one needed a
-- pull request and a deploy. These two tables let people do it through
-- maker checker instead: one person proposes adding or revoking a key,
-- a different person approves it with a step up signature, and only
-- then does approval_issuers change. The list in code is still checked
-- first.
--
-- approval_issuer_changes holds each proposal and its resolution.
-- approval_issuers holds the keys added that way; a row is revoked,
-- never deleted, so every approval ever verified against it stays
-- explainable.
-- =============================================================================

CREATE TABLE IF NOT EXISTS approval_issuer_changes (

    change_id TEXT PRIMARY KEY,

    action TEXT NOT NULL CHECK (action IN ('add', 'revoke')),

    approver_id TEXT NOT NULL,

    key_id TEXT NOT NULL,

    public_key_pem TEXT,

    reason TEXT NOT NULL,

    proposed_by TEXT NOT NULL,

    proposed_at TIMESTAMPTZ NOT NULL,

    status TEXT NOT NULL CHECK (
        status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')
    ),

    resolved_by TEXT,

    resolved_at TIMESTAMPTZ,

    rejection_reason TEXT,

    -- An add carries the key; a revoke does not.
    CHECK ((action = 'add') = (public_key_pem IS NOT NULL)),

    -- Maker is not checker, enforced here as well as in the API.
    CHECK (resolved_by IS NULL OR resolved_by <> proposed_by)

);

-- One open change per approver and key at a time.
CREATE UNIQUE INDEX IF NOT EXISTS ux_approval_issuer_changes_open
ON approval_issuer_changes (
    approver_id,
    key_id
)
WHERE status = 'PENDING_APPROVAL';

CREATE INDEX IF NOT EXISTS idx_approval_issuer_changes_status
ON approval_issuer_changes (
    status
);

ALTER TABLE approval_issuer_changes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS approval_issuers (

    approver_id TEXT NOT NULL,

    key_id TEXT NOT NULL,

    public_key_pem TEXT NOT NULL,

    revoked BOOLEAN NOT NULL DEFAULT FALSE,

    added_by_change_id TEXT NOT NULL
        REFERENCES approval_issuer_changes(change_id)
        ON DELETE RESTRICT,

    added_at TIMESTAMPTZ NOT NULL,

    revoked_by_change_id TEXT
        REFERENCES approval_issuer_changes(change_id)
        ON DELETE RESTRICT,

    revoked_at TIMESTAMPTZ,

    PRIMARY KEY (approver_id, key_id),

    CHECK (revoked = (revoked_by_change_id IS NOT NULL))

);

ALTER TABLE approval_issuers ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- Source: supabase/migrations/20260930120000_add_external_connectors.sql
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


-- =============================================================================
-- Source: supabase/migrations/20261003120000_unique_policy_change_approval_per_pending_change.sql
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


-- =============================================================================
-- Source: supabase/migrations/20261006120000_add_refusal_policy_content_hash.sql
-- Refusal Records carry the hash of the policy content that decided them,
-- the same value an Execution Trust Record carries in
-- transaction.policy.contentHash. Nullable: Refusal Records written before
-- this column existed have no hash and still verify.

ALTER TABLE refusal_records
    ADD COLUMN IF NOT EXISTS policy_content_hash TEXT;


-- =============================================================================
-- Source: supabase/migrations/20261010120000_add_business_signal_sources.sql
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


-- =============================================================================
-- Source: supabase/migrations/20261011120000_add_authority_grants.sql
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


-- =============================================================================
-- Source: supabase/migrations/20261015120000_enable_rls_rate_limit_counters.sql
-- rate_limit_counters was created without row level security, on the reasoning
-- that only the application reads it. The Supabase Data API still exposes
-- public tables to the anon and authenticated roles, so an anon key holder
-- could reset a caller's count or lock one out. Enabling RLS with no policy
-- makes the table default-deny for those roles. The application connects as
-- the table owner and is not affected.
alter table rate_limit_counters enable row level security;
