-- =============================================================================
-- Enable Row Level Security (deny-by-default)
-- =============================================================================
--
-- Security model: only the service-role key, held server-side by Parmana's
-- API (SupabaseClientFactory prefers SUPABASE_SERVICE_ROLE_KEY whenever it is
-- configured), accesses these tables; the service role bypasses RLS by
-- design, so this migration does not need FORCE ROW LEVEL SECURITY and does
-- not define any policy. With RLS enabled and no policy granted, the
-- auto-generated Data API surface is closed to the anon/authenticated roles
-- by default-deny — every one of these tables is otherwise directly
-- reachable through that API once RLS is off, bypassing Parmana's own
-- verification entirely.

ALTER TABLE business_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE execution_trust_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE executions ENABLE ROW LEVEL SECURITY;

ALTER TABLE overrides ENABLE ROW LEVEL SECURITY;

ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
