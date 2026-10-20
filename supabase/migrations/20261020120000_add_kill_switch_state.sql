-- =============================================================================
-- Operator kill switch state (ADR-0017, first build step 1).
-- =============================================================================
--
-- One row, holding the switch state. Read on every authorization and written
-- only by trip and reset. PostgresKillSwitchStore (packages/api/src/killSwitch/)
-- changes the row with a single statement that checks `version`, so two
-- operators acting at once cannot both succeed from the same state.
--
-- The row is seeded here, inactive, so a fresh database reads as "not tripped"
-- rather than as a missing row.
--
-- Row level security is enabled with no policy, the same as the other
-- application-only tables. The application connects as the table owner.

create table if not exists kill_switch_state (
  id integer primary key check (id = 1),
  active boolean not null,
  version integer not null,
  tripped_by text,
  tripped_at timestamptz,
  trip_reason text,
  reset_by text,
  reset_at timestamptz,
  reset_reason text,
  updated_at timestamptz not null default now()
);

insert into kill_switch_state (id, active, version)
values (1, false, 0)
on conflict (id) do nothing;

alter table kill_switch_state enable row level security;
