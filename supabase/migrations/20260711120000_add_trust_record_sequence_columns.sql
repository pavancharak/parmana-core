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
