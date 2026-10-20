-- =============================================================================
-- Operator kill switch: two-person reset and probe history (ADR-0017).
-- =============================================================================
--
-- Production resets take two different operators (decision 1). The first
-- request is held in pending_reset_*; the second operator's request completes
-- it and records the first in reset_requested_by.
--
-- kill_switch_probe keeps the results the external scheduler reports (decision 3:
-- at least one year). This migration does not delete old rows. A retention job
-- that enforces the one-year minimum is not built yet.
--
-- Row level security is enabled with no policy, as in the other tables.

alter table kill_switch_state
  add column if not exists pending_reset_by text,
  add column if not exists pending_reset_at timestamptz,
  add column if not exists pending_reset_reason text,
  add column if not exists reset_requested_by text;

create table if not exists kill_switch_probe (
  id bigint generated always as identity primary key,
  probed_at timestamptz not null,
  recorded_by text not null,
  switch_active boolean not null,
  switch_version integer not null,
  observed_status integer not null,
  observed_error_code text,
  refused boolean not null,
  passed boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists kill_switch_probe_probed_at_idx
  on kill_switch_probe (probed_at);

alter table kill_switch_probe enable row level security;
