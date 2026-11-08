-- =============================================================================
-- Inbound decisions: which approval decided a request (G-143)
-- =============================================================================
--
-- approved_by and approved_at already exist (extend_inbound_decisions). This adds the two columns
-- that identify the approval itself: the approval id, and the key that signed it. Together the four
-- columns let an auditor see who approved, with which key, which approval, and when.
--
-- All four are NULL unless the decision was approved on a verified human approval. They are part of
-- the signed record, so a change to any of them breaks the record's signature.

ALTER TABLE inbound_decisions
  ADD COLUMN IF NOT EXISTS approval_id TEXT,
  ADD COLUMN IF NOT EXISTS approved_key_id TEXT;
