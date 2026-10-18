-- RFC-0019
-- Business Transaction Domain Model v2
--
-- Aligns the storage schema with the canonical
-- BusinessTransaction domain model.

-- Remove obsolete decision column.
ALTER TABLE business_transactions
DROP COLUMN IF EXISTS decision_json;

-- Add canonical trust chain artifacts.
ALTER TABLE business_transactions
ADD COLUMN IF NOT EXISTS authority_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE business_transactions
ADD COLUMN IF NOT EXISTS authorization_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE business_transactions
ADD COLUMN IF NOT EXISTS intent_json JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Remove temporary defaults after migration.
ALTER TABLE business_transactions
ALTER COLUMN authority_json DROP DEFAULT;

ALTER TABLE business_transactions
ALTER COLUMN authorization_json DROP DEFAULT;

ALTER TABLE business_transactions
ALTER COLUMN intent_json DROP DEFAULT;