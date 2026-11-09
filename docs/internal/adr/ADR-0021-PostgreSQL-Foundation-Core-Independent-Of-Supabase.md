# ADR-0021: PostgreSQL as the Database Foundation; Core Independent of Supabase

**Status:** Proposed on 2026-11-09. Not yet accepted by the operator.

**Date:** 2026-11-09

**Relates to:** ADR-0002 (Immutable Domain Model), ADR-0005 (Evidence Is Append-Only), ADR-0016 (Whole-Record Signature Schema V3), ADR-0018 (Connectors Outside Core).

## Context

Parmana stores decisions, execution records and cryptographic evidence. Supabase is a platform built on PostgreSQL. It packages PostgreSQL with authentication, auto-generated REST APIs (PostgREST), file storage, realtime and edge functions. It does not replace PostgreSQL. The choice here is between:

- depending on PostgreSQL directly, behind Parmana's own service and interfaces, or
- depending on Supabase's platform services for the core's persistence and API paths.

The codebase already mixes both. `packages/api` and `packages/storage` use the `pg` driver through `PostgresPoolFactory` and a `postgres` storage implementation. `packages/storage` also has a `supabase` implementation (`SupabaseExecutionAuditSink`) that uses `@supabase/supabase-js`, and `packages/api` contains `SupabaseCallerAuditSink` and `SupabasePolicyRepository`, which are named for Supabase but are built on `pg`. `packages/api/src/routes/ready.ts` reports storage as `not-supabase-backed`. This ADR records the decision that the core must not depend on Supabase, and sets the migration needed to make the code match.

## Decision

1. **PostgreSQL is the database foundation.** Ledger, execution, evidence and audit data are stored in PostgreSQL. Schema changes are versioned SQL migrations in the repository.

2. **Core depends on PostgreSQL, not on Supabase.** Code in `packages/api`, `packages/execution-system`, `packages/approval`, `packages/crypto`, `packages/envelope-verifier` and `packages/replay` must not import `@supabase/supabase-js` or call PostgREST, Supabase Auth (GoTrue), Supabase Storage or Supabase Realtime. Supabase-specific SDK calls are allowed only inside a `storage` adapter that is selected by configuration.

3. **Parmana owns its interfaces.** Persistence is accessed through interfaces defined in core (for example `StorageProvider`, the ledger and evidence repositories, and the audit sink). The PostgreSQL adapter is the reference implementation. Any other adapter, including a Supabase-hosted PostgreSQL adapter, must satisfy the same interface and pass the same contract tests.

4. **Transactions and evidence writes are controlled by Parmana.** Multi-statement transactions that persist a decision with its evidence record run inside a database transaction opened by Parmana's service. No platform-generated HTTP API may be the write path for ledger or evidence data.

5. **Evidence is tamper-evident, not "immutable" by database fiat.** Evidence rows are append-only at the application and privilege level: the application role has no `UPDATE` or `DELETE` on evidence tables, and triggers reject modification. Each record commits to the hash of the previous record (hash chaining). Chain heads are anchored outside the database on a schedule defined in the operator runbook. A database superuser can still alter rows, and the chain plus external anchor is what makes that detectable. Documentation must not describe the database as enforcing immutability on its own.

6. **Verification does not depend on a backend.** The verifier checks evidence using only exported records, the signature schema and public keys. It must not call the live database, Supabase or any Parmana API to verify a record.

7. **Self-hosting remains a supported deployment.** Every feature required by the core must run on a self-managed PostgreSQL instance with the migrations in this repository. Supabase-only features may be used as optional, documented deployment conveniences, never as requirements.

## Why

- **Transaction control.** Ledger decisions and their evidence must commit together. Parmana needs to own that boundary. PostgREST does not offer multi-statement transactions over HTTP, so a platform API cannot be the write path.
- **Verification independence.** An auditor must be able to verify evidence without trusting the operator's platform. That requires verification to depend only on exported data and public keys.
- **Enterprise deployment.** Enterprise customers may require self-hosted infrastructure. Plain PostgreSQL runs in any environment. A self-hosted Supabase stack is a larger set of services for the customer to operate and audit.
- **Technology agnosticism.** When the core owns its interfaces, changing the storage implementation changes an adapter, not the core.

## Consequences

- `@supabase/supabase-js` is removed from the core packages' dependencies. It may remain only in the Supabase storage adapter, if that adapter is kept.
- Supabase-named classes in core (`SupabaseCallerAuditSink`, `SupabasePolicyRepository`) are renamed to describe what they do (for example `PostgresCallerAuditSink`, `PostgresPolicyRepository`). Renames happen in the same change as the interface move, so there are never two active paths for one capability.
- `routes/ready.ts` readiness checks test the PostgreSQL connection and migration version directly, not a Supabase endpoint.
- Moving off a Supabase-hosted database is a `pg_dump` and `pg_restore` plus a configuration change, provided no Supabase-specific feature is in use. The contract tests make this a checked property, not an assumption.
- Costs: the team operates PostgreSQL directly (backups, upgrades, connection pooling, row-level security written as plain SQL) instead of using Supabase's managed tooling. That work is accepted.

## Migration

| Step | Change                                                                                                                                                       | Done when                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1    | Add a storage contract test suite that runs against the PostgreSQL adapter.                                                                                  | Suite passes on a clean PostgreSQL instance from the repository migrations.              |
| 2    | Rename `SupabaseCallerAuditSink` and `SupabasePolicyRepository` to Postgres names, with no behaviour change.                                                 | Renames merged; no references to the old names remain.                                   |
| 3    | Move `SupabaseExecutionAuditSink` behind the storage interface as one adapter among others; remove `supabase-js` imports from core packages.                | `grep` for `supabase-js` in core packages returns nothing.                               |
| 4    | Enforce append-only evidence and hash chaining in the PostgreSQL migrations, with the application role lacking `UPDATE` and `DELETE`.                        | Migration tests show a rejected update and delete and a broken chain detected by replay. |
| 5    | Document the external anchoring procedure in `docs/internal/runbooks/`.                                                                                      | Runbook reviewed by the operator.                                                        |
| 6    | Update `routes/ready.ts` and deployment documentation to describe PostgreSQL requirements only.                                                              | Readiness probe passes against a self-managed PostgreSQL instance.                       |

Each step is one pull request. Step 3 must not merge while any caller still uses the old path.

### Progress

**Step 1 (2026-11-09): done.** The contract is in `packages/storage/tests/contract/storage-provider.contract.ts`, with 16 cases over business transactions and execution trust records. It runs against the memory provider and against the PostgreSQL provider (`SupabaseStorageProvider`, which uses `PostgresPoolFactory`). The PostgreSQL run needs `TEST_DATABASE_URL` and is wired into CI after the migration step. The contract passes on a PostgreSQL 16 database built from `scripts/apply-all-migrations.sql`, with no Supabase roles or `auth` schema present.

The contract found two behaviour differences that it does not yet pin:

- `trustRecords.create()`: the memory provider stores whatever children it is given. The PostgreSQL provider writes only the header, and executions must be appended with `appendExecution()`. Production uses the append order, so the contract tests that order. A caller that passes children to `create()` on the PostgreSQL provider loses them without an error. The memory provider should be changed to match, in a follow-up.
- `trustRecords.appendExecution()` for an unknown transaction: the memory provider does nothing. The PostgreSQL provider inserts the row. The contract does not test this case yet.

**Step 2 (2026-11-09): done.** `SupabaseCallerAuditSink` is now `PostgresCallerAuditSink` (`packages/api/src/auth/PostgresCallerAuditSink.ts`), and `SupabasePolicyRepository` is now `PostgresPolicyRepository` (`packages/policy/src/PostgresPolicyRepository.ts`). The change is a rename only. Code, tests, examples and docs now use the new names.

The old names remain in four places, which were deliberately not edited:

- Committed migration files under `supabase/migrations/` (four comments), and the consolidated `scripts/apply-all-migrations.sql` generated from them. Migrations are applied as history and are not rewritten.
- `04-INCIDENTS-LOG.md`, the incident record.
- This ADR.

`PostgresPolicyRepository` is an exported name of `@parmana/policy`. The package is a workspace package, and this repository has no publish workflow, so no alias was kept. An external consumer of that export would need to update its import.

**Step 3 (2026-11-09): done for `packages/*`.** The execution audit sink is part of the storage interface. `StorageProvider` has an `executionAuditSink` field. The PostgreSQL provider supplies `PostgresExecutionAuditSink` (renamed from `SupabaseExecutionAuditSink`, moved to `packages/storage/src/postgres/`). The memory provider supplies `MemoryExecutionAuditSink`, defined in storage so that storage does not depend on `@parmana/execution-control`.

Production wiring stays fail-closed. `createExecutionAuditSink` takes the sink from a provider pinned to `"postgres"`, not from `PARMANA_STORAGE`. Setting `PARMANA_STORAGE=memory` in production therefore still gives the durable trail, and a test covers it.

Removed from `packages/*`: `packages/storage/scripts/migrate.ts`, the legacy `supabase-js` script that called an `exec_sql` RPC, its `npm run migrate` script, and the `@supabase/supabase-js` dependency of `@parmana/storage`. The `packages/storage/schemas/` SQL files are left in place, unreferenced, for a decision on their removal.

**Not done, and needs a decision:** two root-level scripts still import `@supabase/supabase-js` through PostgREST with an anon key, so the root `devDependency` stays.

- `scripts/verify-policy-changes-approved.ts` is the fail-closed CI gate for the `verify-policy-approvals` job.
- `scripts/policy-approval-log.ts` reads the policy approval log.

Moving either of them to direct Postgres changes the credentials the CI job needs, from an anon key to `DATABASE_URL`. That is a change to a security gate, so it is left for a decision. Until then the ADR's `grep` criterion holds for `packages/*` only.

## Open questions for the operator

1. Should the Supabase storage adapter be kept as a supported deployment option, or removed once step 3 is done?
2. Where should external chain anchors be published, and how often?
