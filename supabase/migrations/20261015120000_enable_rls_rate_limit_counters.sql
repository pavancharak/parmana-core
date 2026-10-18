-- rate_limit_counters was created without row level security, on the reasoning
-- that only the application reads it. The Supabase Data API still exposes
-- public tables to the anon and authenticated roles, so an anon key holder
-- could reset a caller's count or lock one out. Enabling RLS with no policy
-- makes the table default-deny for those roles. The application connects as
-- the table owner and is not affected.
alter table rate_limit_counters enable row level security;
