# 3.31 The Inbound Decision Record Holds Any Action, and the Extension Is Applied (Scoped, 2026-11-05)

Source: CLAIMS.md (commit d1d63c6), lines 2137-2153.

## Exact claim text

## 3.31 The Inbound Decision Record Holds Any Action, and the Extension Is Applied (Scoped, 2026-11-05)

**Claim.** The `inbound_decisions` table holds a decision for any capability. `payment_id` and `limit_inr` are no longer required, and nullable columns record the proposed action (`capability`, `target`, `amount`), the policy (`policy_name`, `policy_version`), the approver (`approved_by`, `approved_at`), and whether the check was in place (`check_status`, `verified` or `not_verified`). Existing refund rows are unchanged. The migration was applied to the production database on 2026-11-05.

**Evidence.**

- `supabase/migrations/20261105140000_extend_inbound_decisions.sql`: additive; no column is dropped and no row is changed. The rollback is written in the file, with its conditions.
- `scripts/apply-all-migrations.sql` regenerated, so the migration-bundle test passes.
- The migration tool's status and apply output, run against production on 2026-11-05: the migration was pending, then applied, and the apply dry run listed it.

**Limits.**

- The check repository writes `capability`, `target`, `amount` and `check_status` (always `verified`), and `policy_name` and `policy_version` on each decision (claim 3.30). It writes `approved_by`, `approved_at`, `approval_id` and `approved_key_id` only on an approved decision that used a verified approval (G-143). Migration `20261108170000` adds `approval_id` and `approved_key_id`.
- The rollback is valid only while no row uses the new columns and every old row still has a value in the two relaxed columns. It is not automated.
- The check repository's SQL is tested by `supabase-inbound-check-consumption.integration.test.ts`, which passed 4 of 4 on a sandbox database with the migrations applied (2026-11-09). The application's routes are tested with an in-memory store.
- Production: checked on 2026-11-09 with a read-only query. Production had the eight columns from migration `20261105140000`. Migration `20261108170000` (`approval_id`, `approved_key_id`) was applied on 2026-11-09 in the production SQL editor, and both columns are present and nullable. All ten columns now exist on production.

## Cited evidence paths

- `scripts/apply-all-migrations.sql`: EXISTS
- `supabase-inbound-check-consumption.integration.test.ts`: MISSING
- `supabase/migrations/20261105140000_extend_inbound_decisions.sql`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                                                                                                                                | Status | Tests | Passed | Skipped |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----- | ------ | ------- |
| `packages/storage/tests/integration/postgres-inbound-check-consumption.integration.test.ts` (cited as `supabase-inbound-check-consumption.integration.test.ts`; renamed) | passed | 4     | 4      | 0       |
