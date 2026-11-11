# 2.32 Per-Caller Tamper-Evident Chaining on the Caller-Authentication Audit Trail

Source: CLAIMS.md (commit d1d63c6), lines 1112-1139.

## Exact claim text

## 2.32 Per-Caller Tamper-Evident Chaining on the Caller-Authentication Audit Trail

**What this closes.** `docs/site/trust-and-claims/objections-and-evidence.mdx` (Domain 3) found that `caller_audit_events` rows were signed (§2.19-adjacent signing milestone, `AuditEventCrypto`) but not chained: unlike `ExecutionTrustRecord`'s `previousChainHash`/`chainHash` (`ExecutionChainCrypto`), a deleted `caller_audit_events` row was undetectable by any mechanism this repo had — a signature proves a _surviving_ row wasn't edited, it says nothing about a row that's simply gone.

**Why not a single global chain.** `caller.authenticated` fires on every authenticated request to every route — `caller_audit_events` is the highest-write-volume table in this system. A global hash chain needs each new row to know its immediate predecessor's hash before writing, which ordinarily means a lock serializing every write through one predecessor lookup — putting that lock on the busiest table would risk a real production bottleneck.

**What was built instead: a chain per caller, not a chain per table.** `PostgresCallerAuditSink.record()` (`packages/api/src/auth/PostgresCallerAuditSink.ts`), when the event carries a `callerId`, opens a transaction and takes a Postgres advisory lock scoped to `hashtext(callerId)` — this serializes only that caller's own concurrent writes, never a different caller's. It then reads that caller's most recent `chain_hash`/`chain_position` (`ORDER BY id DESC LIMIT 1`), folds `previousChainHash`/`chainPosition` into the exact object `AuditEventCrypto.sign()` already signs (the existing `signature_json` column now covers the chain link too — no second signature column), computes `chainHash` via `TrustRecordHasher` (the same idiom `RuntimeEngine` already uses for `policyContentHash`/`signalsHash`), and commits. Events with no `callerId` (the earliest possible rejection — malformed JSON/oversized body, before caller-auth middleware or any route handler runs — and `caller.rejected`) get `NULL` chain fields: there is no per-caller chain to link them into, the same "absent means not covered" discipline every other optional column on this table already follows.

**What this catches, and what it doesn't.** Deleting any row for a caller who has other rows before or after it breaks the chain: the surviving next row's `previousChainHash` still points at the deleted row's `chainHash`, which no longer matches the row now immediately before it in that caller's sequence — `CallerAuditChainVerifier.verifyChain()` (`packages/crypto/src/CallerAuditChainVerifier.ts`) detects this with no network call, no database, and no running Parmana process — the same standalone discipline the "Verify a trust record independently" guide demonstrates for `ExecutionTrustRecord`. It does not catch deleting an entire caller's history at once (nothing remains to show a gap), and it does not detect reordering or deletion across different callers' independent chains — both are honest, stated limits, not oversights.

Evidence

- `supabase/migrations/20260906120000_add_per_caller_chain_to_caller_audit_events.sql` (`chain_hash`, `previous_chain_hash`, `chain_position` columns, nullable and additive; synced into `scripts/apply-all-migrations.sql`)
- `packages/api/src/auth/PostgresCallerAuditSink.ts` (`record()`'s per-caller advisory-lock transaction, chain-link computation)
- `packages/crypto/src/CallerAuditChainVerifier.ts` (new, standalone chain verification)
- `packages/api/tests/unit/postgres-caller-audit-sink.test.ts` (13 cases, including: a new caller starts at `chain_position: 1` with `previous_chain_hash: null`; a second event from the same caller chains to the first with an incremented position; two different callers get independent chains, both starting at position 1; an insert failure mid-transaction rejects the promise with no row persisted; a chained event's signature covers the folded-in `previousChainHash`/`chainPosition`, and a tampered chained event fails verification)
- `packages/crypto/tests/unit/caller-audit-chain-verifier.test.ts` (5 cases: an unbroken three-event chain verifies; a deleted middle row is caught via the resulting `previousChainHash` mismatch; a modified event is caught via its own signature failing; unchained rows verify on signature alone with no linkage required; an empty chain is valid)
- `packages/api/tests/integration/postgres-caller-audit-sink.integration.test.ts` (extended: chain fields present and correctly linked against a real Postgres advisory lock, not just the unit-level fake pool)
- docs/site's "Caller Audit Trail" concept page, for the reader-facing writeup this evidence supports
- Full repo `npx tsc -b`, `npx eslint . --ext .ts`, and `npm test` (`vitest run`) all clean: 1493 passed, 38 pre-existing skips, 0 failed — no regressions

---

**Update (2026-10-16, proof audit, G-108):** the chain does not detect deleting the newest row for a caller, because
nothing remains after it to break. `CallerAuditChainVerifier.verifyChain(rows, anchor)` now accepts a chain head
recorded outside the database. With that anchor, a chain that no longer ends at the head fails verification. Without
an anchor the limit stands. Publishing the head to an external store is an operator step, not yet done.


## Cited evidence paths

- `docs/site/trust-and-claims/objections-and-evidence.mdx`: MISSING
- `packages/api/src/auth/PostgresCallerAuditSink.ts`: EXISTS
- `packages/api/tests/integration/postgres-caller-audit-sink.integration.test.ts`: EXISTS
- `packages/api/tests/unit/postgres-caller-audit-sink.test.ts`: EXISTS
- `packages/crypto/src/CallerAuditChainVerifier.ts`: EXISTS
- `packages/crypto/tests/unit/caller-audit-chain-verifier.test.ts`: EXISTS
- `scripts/apply-all-migrations.sql`: EXISTS
- `supabase/migrations/20260906120000_add_per_caller_chain_to_caller_audit_events.sql`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/integration/postgres-caller-audit-sink.integration.test.ts` | passed | 5 | 0 | 5 |
| `packages/api/tests/unit/postgres-caller-audit-sink.test.ts` | passed | 13 | 13 | 0 |
| `packages/crypto/tests/unit/caller-audit-chain-verifier.test.ts` | passed | 5 | 5 | 0 |
