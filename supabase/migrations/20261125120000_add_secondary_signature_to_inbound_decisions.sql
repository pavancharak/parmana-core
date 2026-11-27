-- Stores the post-quantum (ML-DSA-65) signature over each inbound decision, alongside the
-- Ed25519 signature in `signature`. Nullable: decisions made before this migration, and
-- decisions made while no secondary signer is configured, have no secondary signature.
ALTER TABLE inbound_decisions
  ADD COLUMN IF NOT EXISTS secondary_signature text;
