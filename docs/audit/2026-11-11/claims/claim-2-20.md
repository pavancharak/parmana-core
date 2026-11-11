# 2.20 Atomic Rejection of Duplicate Business Transactions

Source: CLAIMS.md (commit d1d63c6), lines 472-493.

## Exact claim text

## 2.20 Atomic Rejection of Duplicate Business Transactions

Creating a Business Transaction with a `businessTransactionId` that already exists is rejected atomically, with the identical `DuplicateBusinessTransactionError` regardless of storage backend. `MemoryBusinessTransactionRepository.create()` performs its existence check and its write in the same synchronous tick, with no `await` between them, so two concurrent calls for the same id cannot interleave; `SupabaseBusinessTransactionRepository.create()` relies on the `business_transaction_id` column's `PRIMARY KEY` constraint and maps the resulting `23505` unique-violation to the same error class. Neither implementation ever silently overwrites an existing transaction.

**Scope note (`docs/internal/VERIFICATION-GAPS.md` G-29, RESOLVED):** this claim is about the correctness of the rejection — the transaction is never lost, corrupted, or double-accepted; that remains exactly as stated above. A duplicate-ID submission's rejection _attempt_ is now also durably audited (§3.20, `caller.structural_rejected`) — G-29 originally found, and this note originally documented, that it was not.

Evidence

- packages/storage/src/memory/MemoryBusinessTransactionRepository.ts

- packages/storage/src/postgres/PostgresBusinessTransactionRepository.ts (isUniqueViolation mapping)

- packages/shared/src/errors/duplicate-business-transaction-error.ts

- packages/storage/tests/unit/memory-business-transaction-repository.test.ts: two simultaneous `create()` calls with the same id and different content: exactly one succeeds, the other rejects with `DuplicateBusinessTransactionError`, and the stored record is exactly the winner's

- packages/storage/tests/unit/business-transaction-repository-duplicate-consistency.test.ts: both repository implementations throw the identical error class and message for a duplicate

- packages/storage/tests/integration/postgres-business-transaction-duplicate.integration.test.ts: the same concurrent-race proof against a real Postgres database (Supabase-gated)

---

## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
