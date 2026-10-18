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
