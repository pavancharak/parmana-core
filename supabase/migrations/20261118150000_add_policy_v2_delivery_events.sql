-- Policy version 2 delivery events (design: alert delivery, bounces and complaints from any provider).
--
-- policy_v2_delivery_events: each bounce, complaint or delivery that SES reports for a recipient,
-- one row per recipient. event_key is the SNS message id and the recipient, so a retried SNS
-- message is stored once. Append only: a trigger refuses every UPDATE and DELETE.

CREATE TABLE IF NOT EXISTS policy_v2_delivery_events (
  seq bigserial PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  received_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (event_type IN ('Bounce', 'Complaint', 'Delivery')),
  bounce_type text,
  message_id text NOT NULL,
  recipient text NOT NULL,
  detail jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS policy_v2_delivery_events_recipient_idx ON policy_v2_delivery_events (recipient, seq);

CREATE OR REPLACE FUNCTION policy_v2_delivery_events_refuse_change() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'policy_v2_delivery_events is append only: % is refused', TG_OP;
END
$$;

DROP TRIGGER IF EXISTS policy_v2_delivery_events_no_change ON policy_v2_delivery_events;
CREATE TRIGGER policy_v2_delivery_events_no_change
  BEFORE UPDATE OR DELETE ON policy_v2_delivery_events
  FOR EACH ROW EXECUTE FUNCTION policy_v2_delivery_events_refuse_change();

ALTER TABLE policy_v2_delivery_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON policy_v2_delivery_events FROM anon, authenticated;
