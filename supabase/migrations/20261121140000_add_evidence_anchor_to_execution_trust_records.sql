-- The Execution Trust Record carries an evidenceAnchor, which the whole-record signature covers
-- (decision D24). It was built at record creation but never stored, so a record loaded back did
-- not match the one that was signed. This column stores it. Nullable: records created before this
-- migration have no anchor, and the loader leaves the field out, as before.
ALTER TABLE execution_trust_records
  ADD COLUMN IF NOT EXISTS evidence_anchor_json JSONB;
