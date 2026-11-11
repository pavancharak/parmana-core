# 3.11 Durable, Third-Party-Verifiable Refusal and Audit Records (RFC-0021, Scoped)

Source: CLAIMS.md (commit d1d63c6), lines 1584-1629.

## Exact claim text

## 3.11 Durable, Third-Party-Verifiable Refusal and Audit Records (RFC-0021, Scoped)

Every policy `REJECT` decision reachable through `RuntimeEngine.execute` — an ordinary `PolicyEngine.evaluate` rejection or a `SignalIntentBinder` binding-violation rejection — produces a signed, durable **Refusal Record**, independently third-party-verifiable the same way an Execution Trust Record's signature is, without requiring a caller credential or database access to check. This closes what was previously true of this codebase: an approved execution left cryptographic evidence behind (the Execution Trust Record and its signature); a refused one left only an HTTP response and whatever the caller's own logs happened to capture.

`RefusalRecordBuilder` (`packages/runtime/src/RefusalRecordBuilder.ts`) builds the record from the rejected transaction, its `Decision`, the executed intent's target/parameters, and any `SignalIntentBinder` violations; `RefusalCrypto` (`packages/crypto/src/RefusalCrypto.ts`) hashes and signs it with the same `FileKeyProvider`/`DEFAULT_KEY_ID` signing stack every other artifact in this document uses — one root of trust, not a separate one for refusals. `POST /refusal/verify` (`packages/api/src/routes/refusal-verify.ts`) verifies a submitted Refusal Record's signature and returns `{ valid }`; like `POST /audit/verify` below, it is deliberately mounted ahead of caller-auth middleware — no API key, no lookup by id, nothing but the artifact itself and Parmana's public key, which is precisely what makes a refusal independently checkable by whoever received the rejection, not only by Parmana.

Separately, and closing the analogous gap for caller-authentication audit trails (2.16, 2.19): every event a **production** audit sink writes is now signed at write time with `AuditEventCrypto` (`packages/crypto/src/AuditEventCrypto.ts`, the same signing stack again), stored alongside the event as a `signature_json` column. `POST /audit/verify` (`packages/api/src/routes/audit-verify.ts`) verifies any event matching this generic signed-event shape — `CallerAuditEvent` today — through one route, since `AuditEventCrypto.verify()` operates on canonical bytes and a signature alone, never dispatching on the event's own `type`.

**Policy content hash (2026-10-06).** A Refusal Record carries `policyContentHash`, the SHA-256 hash of the policy content that decided it, computed by `RuntimeEngine` from the policy that loaded, the same value an Execution Trust Record carries in `transaction.policy.contentHash`. It is inside the signed canonical record (`RefusalCrypto.canonicalRecord`), so changing, removing or adding it fails verification. Refusal Records written before that date have no `policyContentHash`; an absent field is left out of the canonical form, so they hash exactly as before and still verify (pinned in `crypto-verifiers.exact.test.ts`). Stored in `refusal_records.policy_content_hash` (migration `20261006120000_add_refusal_policy_content_hash.sql`, nullable).

**Scope, precisely — two caveats, both load-bearing:**

1. **Refusal Record writing is evidentiary and fails open, deliberately, not fail-closed like caller-auth audit writes (2.19).** `RuntimeEngine.writeRefusalRecord` runs after `Decision` is built but is explicitly barred, by its own comment, from affecting, delaying past that synchronous attempt, or blocking the `executionGate.enforce()` rejection that follows it — a write failure is logged (`refusal_record_write_failed`) and swallowed, never thrown. The rejection itself is unaffected either way: a request that should be denied is still denied, correctly, whether or not its evidentiary record lands. What can be silently missing is the durable proof of _why_, not the correctness of the refusal itself. `RefusalRecordBuilder`/`RefusalRecordRepository` are also optional at construction (`RuntimeFactory`'s `refusalRecords` parameter); when omitted, no Refusal Record is ever written, by design, not by failure. Verified: `packages/runtime/tests/unit/refusal-record-fail-open.test.ts`.

   **Considered and rejected (2026-08-19): making this write atomic/fail-closed with the rejection response** (write the record synchronously before returning to the caller; a storage failure would surface as `500` instead of `403`). Rejected because it does not strengthen the property that actually matters — the request is already unconditionally denied, correctly, the instant `Decision` is built, regardless of whether the evidentiary write ever runs — and it introduces a new one: a Supabase hiccup would turn a _correct_ policy rejection into an opaque server error, a genuine availability regression (and a storage-pressure denial-of-service vector) for zero corresponding security gain. "Fail-closed" is the right discipline for whether a dangerous action executes; the refusal record is evidence _about_ a decision already enforced, not a gate on it. The existing remedy for a durability gap — logging `refusal_record_write_failed` loudly for an operator to reconcile — is the correct one; blocking the caller's response on it is not.

2. **Only production (PostgreSQL) audit sinks sign.** `PostgresCallerAuditSink` signs every event; `InMemoryCallerAuditSink` (test wiring, `NODE_ENV=test`) does not. This claim is therefore about the production deployment path specifically, not every configuration this codebase can run in. Existing rows written before this capability shipped remain unsigned; `signature_json` is nullable and additive, honestly reflecting that history rather than backfilling a signature that was never actually produced at write time.

A third, narrower operational note, not a scope caveat on the claim itself: `PostgresCallerAuditSink` currently writes via a direct Postgres connection rather than PostgREST. This originated as a narrow workaround for a PostgREST schema-cache issue with one new column (Supabase support ticket SU-437429), but a production-readiness audit (2026-09-09) found the pattern has since been extended deliberately, repo-wide: **8 of the 9** `Supabase*` storage classes now write via `PostgresPoolFactory` rather than PostgREST/supabase-js, per `SupabaseExecutionTrustRecordRepository.ts`'s own comment — "part of removing PostgREST from every Supabase-backed table's failure modes, not just the audit sinks that broke first." This is no longer a single revertible patch pending one support ticket; it is the storage layer's current architecture. `SupabaseClientFactory` (the supabase-js/PostgREST client class this workaround originally planned to revert to) had zero remaining call sites as of that audit and was deleted the same day, along with its now-unused `@supabase/supabase-js` dependency (`docs/internal/VERIFICATION-GAPS.md` G-34) — a revert, if SU-437429 is ever resolved, would mean reintroducing a PostgREST client, not restoring one that still exists.

Evidence

- `packages/crypto/src/RefusalCrypto.ts`, `AuditEventCrypto.ts`

- `packages/runtime/src/RefusalRecordBuilder.ts`, `RuntimeEngine.ts` (`writeRefusalRecord`, fail-open by design)

- `packages/shared/src/domain/refusal-record.ts`, `repositories/refusal-record-repository.ts`

- `packages/storage/src/memory/MemoryRefusalRecordRepository.ts`, `supabase/SupabaseRefusalRecordRepository.ts`

- `packages/api/src/routes/refusal-verify.ts`, `refusal-get.ts`, `audit-verify.ts`

- `packages/api/src/auth/PostgresCallerAuditSink.ts`, `InMemoryCallerAuditSink.ts` (signs / does not sign, respectively)

- `04-INCIDENTS-LOG.md`, INC-7 ("Audit-sink events were durable but unsigned") — the incident this capability closes, including the PostgREST workaround noted above

- `docs/internal/rfcs/RFC-0021-Refusal-Record.md`

- `packages/api/tests/integration/refusal-record.integration.test.ts` (6 tests), `audit-verify.integration.test.ts` (4 tests, corrected 2026-08-24, previously cited as 5): real `POST /refusal/verify` and `POST /audit/verify` HTTP requests — valid signature accepted, tampered payload rejected, mounted ahead of caller-auth (no credential required)

- `packages/runtime/tests/unit/refusal-record-fail-open.test.ts` (2 tests): a Refusal Record write failure does not affect the returned rejection

- `packages/storage/tests/unit/postgres-refusal-record-repository.test.ts` (4 tests)

---


## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `docs/internal/rfcs/RFC-0021-Refusal-Record.md`: EXISTS
- `packages/api/src/auth/PostgresCallerAuditSink.ts`: EXISTS
- `packages/api/src/routes/audit-verify.ts`: EXISTS
- `packages/api/src/routes/refusal-verify.ts`: EXISTS
- `packages/api/tests/integration/refusal-record.integration.test.ts`: EXISTS
- `packages/crypto/src/AuditEventCrypto.ts`: EXISTS
- `packages/crypto/src/RefusalCrypto.ts`: EXISTS
- `packages/runtime/src/RefusalRecordBuilder.ts`: EXISTS
- `packages/runtime/tests/unit/refusal-record-fail-open.test.ts`: EXISTS
- `packages/shared/src/domain/refusal-record.ts`: EXISTS
- `packages/storage/src/memory/MemoryRefusalRecordRepository.ts`: EXISTS
- `packages/storage/tests/unit/postgres-refusal-record-repository.test.ts`: EXISTS
- `supabase/SupabaseRefusalRecordRepository.ts`: MISSING

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/integration/refusal-record.integration.test.ts` | passed | 6 | 6 | 0 |
| `packages/runtime/tests/unit/refusal-record-fail-open.test.ts` | passed | 2 | 2 | 0 |
| `packages/storage/tests/unit/postgres-refusal-record-repository.test.ts` | passed | 6 | 6 | 0 |
