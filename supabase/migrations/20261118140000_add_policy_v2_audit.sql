-- Policy version 2 audit (design: plan section 5.1 and the register's audit log).
--
-- policy_v2_audit: the audit events of each component, written in the same transaction as the
-- snapshot they describe. Append only: a trigger refuses every UPDATE and DELETE.
--
-- Roles are part of the register snapshot. The first Parmana owner is set up by the runtime
-- from PARMANA_POLICY_V2_BOOTSTRAP_OWNER, once, while no owner exists.

CREATE TABLE IF NOT EXISTS policy_v2_audit (
  seq bigserial PRIMARY KEY,
  component text NOT NULL CHECK (component IN ('register', 'review', 'alerts')),
  at timestamptz NOT NULL,
  by_id text NOT NULL,
  event text NOT NULL,
  detail text NOT NULL
);

CREATE INDEX IF NOT EXISTS policy_v2_audit_component_idx ON policy_v2_audit (component, seq);

CREATE OR REPLACE FUNCTION policy_v2_audit_refuse_change() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'policy_v2_audit is append only: % is refused', TG_OP;
END
$$;

DROP TRIGGER IF EXISTS policy_v2_audit_no_change ON policy_v2_audit;
CREATE TRIGGER policy_v2_audit_no_change
  BEFORE UPDATE OR DELETE ON policy_v2_audit
  FOR EACH ROW EXECUTE FUNCTION policy_v2_audit_refuse_change();

ALTER TABLE policy_v2_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON policy_v2_audit FROM anon, authenticated;
