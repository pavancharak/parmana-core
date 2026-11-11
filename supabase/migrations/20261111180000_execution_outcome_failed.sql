-- =============================================================================
-- Execution outcome: a 'failed' state (outcome-record defect, enforcement-path
-- guide section 11)
-- =============================================================================
--
-- A release refused before the connector ran, after the nonce was consumed,
-- is recorded as 'failed' with the refusal reason. Before this, such a row
-- stayed 'in_flight' forever, so a retry was answered "outcome unknown" even
-- though nothing ran.
--
-- A refusal before the nonce is consumed deletes the in-flight row instead
-- (no migration needed for that; the store's abort does it).
--
-- Status values now: in_flight, completed, failed.
-- The failure_reason is required for failed rows and is never secret: it is
-- the refusal's own message.

ALTER TABLE execution_outcomes
    DROP CONSTRAINT IF EXISTS execution_outcomes_status_check;

ALTER TABLE execution_outcomes
    ADD CONSTRAINT execution_outcomes_status_check
    CHECK (status IN ('in_flight', 'completed', 'failed'));

ALTER TABLE execution_outcomes
    ADD COLUMN IF NOT EXISTS failure_reason TEXT;

ALTER TABLE execution_outcomes
    DROP CONSTRAINT IF EXISTS execution_outcomes_failed_has_reason;

ALTER TABLE execution_outcomes
    ADD CONSTRAINT execution_outcomes_failed_has_reason
    CHECK (status <> 'failed' OR failure_reason IS NOT NULL);
