-- Policy version 2 state (design: plan section 4, build step 8).
--
-- policy_v2_state: the register, the review queue and the alert board, each
-- stored as one snapshot. The version column is checked on every save, so two
-- writers cannot overwrite each other silently.
--
-- policy_v2_evidence: the decision evidence log. Append only: a trigger refuses
-- every UPDATE and DELETE, and each record links to the hash of the one before.

CREATE TABLE IF NOT EXISTS policy_v2_state (
  component text PRIMARY KEY CHECK (component IN ('register', 'review', 'alerts')),
  body jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_v2_evidence (
  seq bigserial PRIMARY KEY,
  record_id text NOT NULL UNIQUE,
  policy_hash text NOT NULL,
  prev_hash text NOT NULL,
  hash text NOT NULL UNIQUE,
  body jsonb NOT NULL,
  decided_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION policy_v2_evidence_refuse_change() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'policy_v2_evidence is append only: % is refused', TG_OP;
END
$$;

DROP TRIGGER IF EXISTS policy_v2_evidence_no_update ON policy_v2_evidence;
CREATE TRIGGER policy_v2_evidence_no_update
  BEFORE UPDATE OR DELETE ON policy_v2_evidence
  FOR EACH ROW EXECUTE FUNCTION policy_v2_evidence_refuse_change();

ALTER TABLE policy_v2_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_v2_evidence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON policy_v2_state FROM anon, authenticated;
REVOKE ALL ON policy_v2_evidence FROM anon, authenticated;
