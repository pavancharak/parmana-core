-- Policy version 2 nonces (design: plan section 4.5 and 4.6).
--
-- policy_v2_nonces: every source answer and approval nonce that has been used. A nonce is
-- stored once, with the time it expires. The primary key makes a second use fail, even
-- when two processes try at the same moment, so a nonce cannot be used twice.
-- Rows past their expiry are removed by the store.

CREATE TABLE IF NOT EXISTS policy_v2_nonces (
  nonce text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS policy_v2_nonces_expires_at_idx ON policy_v2_nonces (expires_at);

ALTER TABLE policy_v2_nonces ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON policy_v2_nonces FROM anon, authenticated;
