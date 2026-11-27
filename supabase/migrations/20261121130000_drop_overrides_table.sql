-- Overrides are removed from the Execution Trust Record format. They are no longer part of
-- the hashed or signed fields (parmana-core frozen canonical view, owner approved), and no
-- code path creates or reads them. The overrides table, its index, its row-level security
-- and its sequence columns are dropped with it.
--
-- The owner confirmed there are no customers, vendors or live traffic, so existing override
-- rows are not needed. Apply only after the owner's approval.
DROP TABLE IF EXISTS overrides;
