-- Policy version 2 role events (design: plan section 5.1, roles granted by the Parmana owner).
--
-- policy_v2_role_events: every grant and revocation of a register role. Append only: a
-- trigger refuses every UPDATE and DELETE. A caller's current roles are the latest event
-- for each role. The Parmana owner's grants are recorded here, and the first Parmana owner
-- is granted by an operator with the service role, for example:
--   INSERT INTO policy_v2_role_events (caller_id, role, action, by_caller)
--   VALUES ('first-owner-id', 'parmana-owner', 'grant', 'bootstrap');

CREATE TABLE IF NOT EXISTS policy_v2_role_events (
  seq bigserial PRIMARY KEY,
  caller_id text NOT NULL,
  role text NOT NULL CHECK (role IN (
    'second-approver', 'risk-function', 'parmana-owner', 'source-owner',
    'action-owner', 'gate-owner', 'reviewer'
  )),
  action text NOT NULL CHECK (action IN ('grant', 'revoke')),
  by_caller text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS policy_v2_role_events_caller_idx ON policy_v2_role_events (caller_id, role, seq);
CREATE INDEX IF NOT EXISTS policy_v2_role_events_role_idx ON policy_v2_role_events (role, caller_id, seq);

CREATE OR REPLACE FUNCTION policy_v2_role_events_refuse_change() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'policy_v2_role_events is append only: % is refused', TG_OP;
END
$$;

DROP TRIGGER IF EXISTS policy_v2_role_events_no_change ON policy_v2_role_events;
CREATE TRIGGER policy_v2_role_events_no_change
  BEFORE UPDATE OR DELETE ON policy_v2_role_events
  FOR EACH ROW EXECUTE FUNCTION policy_v2_role_events_refuse_change();

ALTER TABLE policy_v2_role_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON policy_v2_role_events FROM anon, authenticated;
