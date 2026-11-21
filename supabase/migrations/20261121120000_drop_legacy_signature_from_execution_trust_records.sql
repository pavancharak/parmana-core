-- Decision D24: trust records are schema version 3 only, and carry their signatures in
-- signatures_json. The legacy signature_json column (seven fields, schema version 2 only)
-- is no longer written or read, so it is dropped.
--
-- The owner confirmed there are no customers, vendors or live traffic, so the legacy
-- signatures in existing rows are not needed as evidence. Apply only after the owner's approval.
ALTER TABLE execution_trust_records
  DROP COLUMN IF EXISTS signature_json;
